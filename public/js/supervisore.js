// public/js/supervisore.js

(function () {
  // --- Riferimenti agli elementi DOM ---
  const startRoundBtn = document.getElementById('startRoundBtn');
  const adminTextEl = document.getElementById('adminText');
  const currentRoundNumberEl = document.getElementById('currentRoundNumber');
  const roundCountdownEl = document.getElementById('roundCountdown');
  const roundStatusEl = document.getElementById('roundStatus');
  const playersContainer = document.getElementById('playersContainer');
  const scoreListEl = document.getElementById('scoreList');
  // const orderPlayersEl = document.getElementById('orderPlayers'); // se in futuro vuoi ordinamenti

  // --- Stato applicazione lato supervisore ---

  let ws = null;

  // Info sul round corrente
  let currentRoundId = null;
  let currentRoundNumber = null;
  let currentRoundDurationMs = 30000;
  let roundStartTime = null;
  let countdownInterval = null;

  // Mappa dei giocatori attualmente noti (collegati)
  // key: playerId ; value: { playerId, playerName, score, currentAnswer }
  // dove currentAnswer: { text, submittedAt, submittedByTimeout, late, answerTimeMs }
  const playersById = new Map();

  // Punteggi globali per nome (da /api/scores + aggiornamenti WS)
  // key: playerName ; value: { playerName, score }
  const scoresByName = new Map();

  // --- WebSocket ---

  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws`);

    ws.addEventListener('open', () => {
      console.log('WS supervisore connesso');

      // appena il supervisore si collega, dichiara il proprio ruolo al server
      // così il server può inviargli subito la lista dei giocatori connessi
      try {
        ws.send(
          JSON.stringify({
            type: 'admin_register'
          })
        );
      } catch (err) {
        console.error('Errore invio admin_register:', err);
      }

      setRoundStatus('Nessun round', 'secondary');
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'round_start':
          handleRoundStart(msg);
          break;
        case 'round_answer':
          handleRoundAnswer(msg);
          break;
        case 'score_update':
          handleScoreUpdate(msg);
          break;
        case 'player_list':
          handlePlayerList(msg);
          break;
        case 'player_renamed_broadcast':
          handlePlayerRenamed(msg);
          break;
        default:
          // Altri tipi di messaggio possono essere ignorati o loggati
          break;
      }
    });

    ws.addEventListener('close', () => {
      console.log('WS chiuso, tentativo di riconnessione tra poco...');
      setRoundStatus('Connessione persa', 'danger');
      setTimeout(connectWS, 3000);
    });
  }

  // --- Gestione messaggi WS ---

  function handleRoundStart(msg) {
    // Imposta i dati di round corrente
    currentRoundId = msg.roundId;
    currentRoundNumber = msg.roundNumber;
    currentRoundDurationMs = msg.durationMs || 30000;
    roundStartTime = new Date(msg.startTime);

    currentRoundNumberEl.textContent = currentRoundNumber;
    setRoundStatus('Round in corso', 'success');

    // Puliamo lo stato delle risposte correnti per tutti i giocatori
    for (const player of playersById.values()) {
      player.currentAnswer = null;
    }

    // Avviamo il countdown e ridisegniamo la griglia
    startCountdown();
    renderPlayers();
  }

  function handleRoundAnswer(msg) {
    const playerId = msg.playerId;
    const playerName = msg.playerName || 'Senza nome';

    // Recuperiamo il giocatore dalla mappa, se esiste,
    // altrimenti lo creiamo "al volo" (potrebbe essersi collegato da poco)
    let player = playersById.get(playerId);
    if (!player) {
      player = {
        playerId,
        playerName,
        score: getScoreForName(playerName),
        currentAnswer: null
      };
      playersById.set(playerId, player);
    } else {
      // Aggiorniamo sempre il nome in caso di rename lato client
      player.playerName = playerName;
    }

    // Calcoliamo il tempo di risposta (ms dal start round)
    const submittedAt = new Date(msg.submittedAt);
    const answerTimeMs = roundStartTime
      ? submittedAt - roundStartTime
      : null;

    // Salviamo la risposta nel giocatore
    player.currentAnswer = {
      text: msg.text || '',
      submittedAt,
      submittedByTimeout: !!msg.submittedByTimeout,
      late: !!msg.late,
      answerTimeMs
    };

    // Ridisegniamo la griglia
    renderPlayers();
  }

  function handleScoreUpdate(msg) {
    const { playerName, score } = msg;
    if (!playerName) return;

    // Aggiorniamo la mappa dei punteggi
    scoresByName.set(playerName, { playerName, score });

    // Aggiorniamo eventuali giocatori con quel nome
    for (const player of playersById.values()) {
      if (player.playerName === playerName) {
        player.score = score;
      }
    }

    // Ridisegniamo: scoreboard + griglia giocatori
    renderScores();
    renderPlayers();
  }

  function handlePlayerList(msg) {
    // Ci aspettiamo un payload del tipo:
    // { type: 'player_list', players: [ { playerId, playerName }, ... ] }

    const list = msg.players || [];

    // Mettiamo i player ricevuti in una mappa temporanea per capire chi è ancora attivo
    const activeIds = new Set();

    list.forEach((p) => {
      const id = p.playerId;
      const name = p.playerName || 'Senza nome';
      activeIds.add(id);

      let player = playersById.get(id);
      if (!player) {
        // Nuovo giocatore
        player = {
          playerId: id,
          playerName: name,
          score: getScoreForName(name),
          currentAnswer: null // sarà riempito quando riceviamo round_answer
        };
        playersById.set(id, player);
      } else {
        // Giocatore esistente: aggiorno solo il nome
        player.playerName = name;
        // Il punteggio resta coerente con scoresByName
        player.score = getScoreForName(name);
      }
    });

    // Rimuoviamo dalla mappa i giocatori che non sono più nella lista
    for (const id of playersById.keys()) {
      if (!activeIds.has(id)) {
        playersById.delete(id);
      }
    }

    // Ridisegniamo la griglia
    renderPlayers();
  }

  function handlePlayerRenamed(msg) {
    // Messaggio opzionale:
    // { type: 'player_renamed_broadcast', playerId, playerName }
    const playerId = msg.playerId;
    const newName = msg.playerName || 'Senza nome';

    const player = playersById.get(playerId);
    if (!player) return;

    player.playerName = newName;

    // Aggiorniamo il punteggio visualizzato per questo nome
    player.score = getScoreForName(newName);

    renderPlayers();
  }

  // --- Countdown round ---

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    function update() {
      if (!roundStartTime) return;
      const now = new Date();
      const diff = now - roundStartTime;
      const remainingMs = currentRoundDurationMs - diff;
      const remainingSec = Math.max(Math.ceil(remainingMs / 1000), 0);
      roundCountdownEl.textContent = remainingSec;
      if (remainingSec <= 0) {
        setRoundStatus('Tempo scaduto (risposte in arrivo...)', 'warning');
      }
    }

    update();
    countdownInterval = setInterval(update, 500);
  }

  // --- UI helper: stato round ---

  function setRoundStatus(text, color) {
    roundStatusEl.textContent = text;
    roundStatusEl.className = `badge bg-${color}`;
  }

  // --- Render griglia giocatori & risposte ---

  function renderPlayers() {
    playersContainer.innerHTML = '';

    // Convertiamo la mappa in array
    const arr = Array.from(playersById.values());

    // Ordinamento base per nome (puoi cambiare facilmente in futuro)
    arr.sort((a, b) =>
      (a.playerName || '').localeCompare(b.playerName || '')
    );

    if (arr.length === 0) {
      playersContainer.innerHTML =
        '<p class="text-muted">Nessun giocatore connesso.</p>';
      return;
    }

    arr.forEach((player) => {
      const col = document.createElement('div');
      col.className = 'col-md-6 col-xl-4'; // layout responsivo per molti giocatori

      // Determiniamo lo "stato" grafico in base alla presenza della risposta
      let cardBorderClass = 'border-secondary';
      let statusBadge = '<span class="badge bg-secondary">In attesa</span>';
      let bodyHtml = `
        <p class="card-text text-muted small mb-0">
          Nessuna risposta ancora per questo round.
        </p>
      `;

      if (player.currentAnswer) {
        // Ha risposto
        const a = player.currentAnswer;
        cardBorderClass = 'border-success';

        const submittedTimeStr = a.submittedAt
          ? a.submittedAt.toLocaleTimeString()
          : '-';

        const answerTimeSec = a.answerTimeMs
          ? (a.answerTimeMs / 1000).toFixed(1)
          : '';

        let badges = '';
        if (a.submittedByTimeout) {
          badges +=
            '<span class="badge bg-warning text-dark me-1">Auto (timeout)</span>';
        }
        if (a.late) {
          badges +=
            '<span class="badge bg-danger me-1">Oltre i 30s (entro tolleranza)</span>';
        }

        statusBadge =
          '<span class="badge bg-success">Risposta ricevuta</span>';

        bodyHtml = `
          <p class="card-text" style="white-space: pre-wrap;">${escapeHtml(
            a.text || ''
          )}</p>
          <div class="small text-muted">
            Inviata alle ${submittedTimeStr}
            ${
              answerTimeSec
                ? ` &middot; ${answerTimeSec}s dopo l'inizio`
                : ''
            }
            <br>
            ${badges}
          </div>
          <button
            class="btn btn-sm btn-success mt-2 assign-win-btn"
            data-player-name="${encodeURIComponent(
              player.playerName || 'Senza nome'
            )}"
          >
            Assegna vittoria (+1)
          </button>
        `;
      }

      const scoreDisplay = player.score != null ? player.score : 0;

      col.innerHTML = `
        <div class="card h-100 ${cardBorderClass}">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <h6 class="card-subtitle mb-0">
                ${escapeHtml(player.playerName || 'Senza nome')}
              </h6>
              ${statusBadge}
            </div>
            <div class="small text-muted mb-2">
              Punteggio: <strong>${scoreDisplay}</strong>
            </div>
            <div class="flex-grow-1">
              ${bodyHtml}
            </div>
          </div>
        </div>
      `;

      playersContainer.appendChild(col);
    });
  }

  // --- Render lista punteggi globali ---

  function renderScores() {
    scoreListEl.innerHTML = '';

    if (scoresByName.size === 0) {
      scoreListEl.innerHTML =
        '<li class="list-group-item text-muted">Nessun punteggio registrato.</li>';
      return;
    }

    // Array ordinato per punteggio desc, poi nome
    const arr = Array.from(scoresByName.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.playerName || '').localeCompare(b.playerName || '');
    });

    arr.forEach((s) => {
      const li = document.createElement('li');
      li.className =
        'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `
        <span>${escapeHtml(s.playerName)}</span>
        <span class="badge bg-primary rounded-pill">${s.score}</span>
      `;
      scoreListEl.appendChild(li);
    });
  }

  // --- Azioni supervisor (start round + assegna vittoria) ---

  function onStartRoundClick() {
    const text = adminTextEl.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: 'admin_round_start',
        text
      })
    );

    // Possiamo aggiornare lo stato in attesa della conferma round_start
    setRoundStatus('Avvio round...', 'info');
  }

  async function onAssignWinClick(event) {
    const btn = event.target.closest('.assign-win-btn');
    if (!btn) return;

    const playerName = decodeURIComponent(btn.dataset.playerName || '');
    if (!playerName) return;

    try {
      // API REST che avevi già lato server: /api/scores/increment
      const res = await fetch('/api/scores/increment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, roundId: currentRoundId })
      });

      if (!res.ok) {
        console.error('Errore API punteggio', await res.text());
      }
    } catch (err) {
      console.error('Errore invio punteggio:', err);
    }
  }

  // --- Funzioni di utility ---

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getScoreForName(playerName) {
    const s = scoresByName.get(playerName);
    return s ? s.score : 0;
  }

  async function loadScores() {
    try {
      const res = await fetch('/api/scores');
      const scores = await res.json();
      scoresByName.clear();
      scores.forEach((s) => {
        scoresByName.set(s.playerName, {
          playerName: s.playerName,
          score: s.score
        });
      });

      // Aggiorniamo anche lo score associato ai giocatori già noti
      for (const player of playersById.values()) {
        player.score = getScoreForName(player.playerName);
      }

      renderScores();
      renderPlayers();
    } catch (err) {
      console.error('Errore caricamento punteggi:', err);
    }
  }

  // --- Event listeners globali ---

  startRoundBtn.addEventListener('click', onStartRoundClick);
  playersContainer.addEventListener('click', onAssignWinClick);

  // init
  connectWS();
  loadScores();
})();

