// public/js/gioco.js

(function () {
  const playerNameInput = document.getElementById('playerNameInput');
  const saveNameBtn = document.getElementById('saveNameBtn');
  const adminTextDisplay = document.getElementById('adminTextDisplay');
  const roundNumberEl = document.getElementById('roundNumber');
  const roundCountdownEl = document.getElementById('roundCountdown');
  const answerInput = document.getElementById('answerInput');
  const sendAnswerBtn = document.getElementById('sendAnswerBtn');
  const statusMessageEl = document.getElementById('statusMessage');
  const playerScoreEl = document.getElementById('playerScore');
  const roundGalleryEl = document.getElementById('roundGallery');

  let ws;
  let playerId = null;
  let playerName = null;
  let currentRoundId = null;
  let currentRoundDurationMs = 30000;
  let roundStartTime = null;
  let countdownInterval = null;
  let autoSendTimeout = null;
  let hasSubmitted = false;

  // Risposte del round corrente (per mostrare galleria)
  // key: playerId, value: { playerId, playerName, text, submittedAt, submittedByTimeout, late, imagePath, imageStatus }
  const roundAnswers = new Map();

  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws`);

    ws.addEventListener('open', () => {
      console.log('WS player connesso');
      registerPlayer();
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'player_registered':
          handlePlayerRegistered(msg);
          break;
        case 'player_renamed':
          handlePlayerRenamed(msg);
          break;
        case 'round_start':
          handleRoundStart(msg);
          break;
        case 'round_answer':
          handleRoundAnswer(msg);
          break;
        case 'answer_image_ready':
          handleAnswerImageReady(msg);
          break;
        case 'answer_accepted':
          handleAnswerAccepted(msg);
          break;
        case 'answer_rejected':
          handleAnswerRejected(msg);
          break;
        case 'score_update':
          handleScoreUpdate(msg);
          break;
        default:
          break;
      }
    });

    ws.addEventListener('close', () => {
      console.log('WS chiuso, riconnessione...');
      setTimeout(connectWS, 3000);
    });
  }

  function registerPlayer() {
    const storedName = localStorage.getItem('playerName');
    if (storedName) {
      playerName = storedName;
      playerNameInput.value = storedName;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'player_register',
          playerName: playerName || undefined
        })
      );
    }
  }

  function handlePlayerRegistered(msg) {
    playerId = msg.playerId;
    playerName = msg.playerName;
    playerNameInput.value = playerName;
    localStorage.setItem('playerName', playerName);
    statusMessageEl.textContent = `Sei registrato come "${playerName}"`;
    loadMyScore();
  }

  function handlePlayerRenamed(msg) {
    playerName = msg.playerName;
    localStorage.setItem('playerName', playerName);
    statusMessageEl.textContent = `Nome aggiornato a "${playerName}"`;
    loadMyScore();
  }

  function handleRoundStart(msg) {
    currentRoundId = msg.roundId;
    currentRoundDurationMs = msg.durationMs || 30000;
    roundStartTime = new Date(msg.startTime);
    hasSubmitted = false;

    adminTextDisplay.textContent = msg.text || '';
    roundNumberEl.textContent = msg.roundNumber || '-';
    statusMessageEl.textContent =
      'Round in corso! Hai 30 secondi per inviare.';

    answerInput.disabled = false;
    answerInput.value = '';
    sendAnswerBtn.disabled = false;
    answerInput.focus();

    // Reset galleria
    roundAnswers.clear();
    renderGallery();

    startCountdown();
    scheduleAutoSend();
  }

  function handleRoundAnswer(msg) {
    // Ignoriamo risposte di altri round (edge case)
    if (msg.roundId && currentRoundId && msg.roundId !== currentRoundId) {
      return;
    }

    const answerPlayerId = msg.playerId;
    const answerPlayerName = msg.playerName || 'Senza nome';

    const submittedAt = msg.submittedAt
      ? new Date(msg.submittedAt)
      : null;

    const entry = {
      playerId: answerPlayerId,
      playerName: answerPlayerName,
      text: msg.text || '',
      submittedAt,
      submittedByTimeout: !!msg.submittedByTimeout,
      late: !!msg.late,
      imagePath: msg.imagePath || null,
      imageStatus: msg.imageStatus || 'pending'
    };

    roundAnswers.set(answerPlayerId, entry);
    renderGallery();
  }

  function handleAnswerImageReady(msg) {
    if (msg.roundId && currentRoundId && msg.roundId !== currentRoundId) {
      return;
    }

    const answerPlayerId = msg.playerId;
    const answerPlayerName = msg.playerName || 'Senza nome';

    let entry = roundAnswers.get(answerPlayerId);
    if (!entry) {
      entry = {
        playerId: answerPlayerId,
        playerName: answerPlayerName,
        text: '',
        submittedAt: null,
        submittedByTimeout: false,
        late: false,
        imagePath: null,
        imageStatus: 'pending'
      };
      roundAnswers.set(answerPlayerId, entry);
    }

    entry.playerName = answerPlayerName;
    entry.imagePath = msg.imagePath || null;
    entry.imageStatus = msg.imagePath ? 'ok' : 'error';

    renderGallery();
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    function update() {
      if (!roundStartTime) return;
      const now = new Date();
      const diff = now - roundStartTime;
      const remainingMs = currentRoundDurationMs - diff;
      const remainingSec = Math.max(Math.ceil(remainingMs / 1000), 0);
      roundCountdownEl.textContent = remainingSec;
    }

    update();
    countdownInterval = setInterval(update, 500);
  }

  function scheduleAutoSend() {
    if (autoSendTimeout) clearTimeout(autoSendTimeout);
    autoSendTimeout = setTimeout(() => {
      if (!hasSubmitted) {
        sendAnswer(true);
      }
    }, currentRoundDurationMs); // 30 secondi
  }

  function sendAnswer(sentByTimeout) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!currentRoundId) return;
    if (hasSubmitted) return;

    const text = answerInput.value || '';

    ws.send(
      JSON.stringify({
        type: 'player_answer',
        roundId: currentRoundId,
        playerId,
        playerName,
        text,
        sentByTimeout: !!sentByTimeout
      })
    );

    hasSubmitted = true;
    answerInput.disabled = true;
    sendAnswerBtn.disabled = true;

    if (sentByTimeout) {
      statusMessageEl.textContent =
        'Tempo scaduto, risposta inviata automaticamente.';
    } else {
      statusMessageEl.textContent = 'Risposta inviata, attendi i risultati.';
    }
  }

  function handleAnswerAccepted(msg) {
    console.log('Risposta accettata:', msg);
  }

  function handleAnswerRejected(msg) {
    statusMessageEl.textContent =
      'La tua risposta non è stata accettata (' + (msg.reason || 'motivo sconosciuto') + ').';
  }

  function handleScoreUpdate(msg) {
    // se è il nostro nome, aggiorniamo
    if (msg.playerName === playerName) {
      playerScoreEl.textContent = msg.score;
    }
  }

  async function loadMyScore() {
    if (!playerName) return;
    try {
      const res = await fetch('/api/scores');
      const scores = await res.json();
      const mine = scores.find((s) => s.playerName === playerName);
      playerScoreEl.textContent = mine ? mine.score : 0;
    } catch (err) {
      console.error('Errore caricamento punteggio:', err);
    }
  }

  function renderGallery() {
    if (!roundGalleryEl) return;
    roundGalleryEl.innerHTML = '';

    if (roundAnswers.size === 0) {
      roundGalleryEl.innerHTML =
        '<p class="text-muted mb-0">Nessuna risposta ricevuta ancora.</p>';
      return;
    }

    const arr = Array.from(roundAnswers.values()).sort((a, b) =>
      (a.playerName || '').localeCompare(b.playerName || '')
    );

    arr.forEach((ans) => {
      const col = document.createElement('div');
      col.className = 'col-md-6 col-xl-4';

      const isMe = ans.playerId === playerId;

      let badges = '';
      if (isMe) {
        badges += '<span class="badge bg-primary me-1">Tu</span>';
      }
      if (ans.submittedByTimeout) {
        badges +=
          '<span class="badge bg-warning text-dark me-1">Auto (timeout)</span>';
      }
      if (ans.late) {
        badges +=
          '<span class="badge bg-danger me-1">Oltre i 30s (entro tolleranza)</span>';
      }
      if (ans.imageStatus === 'pending') {
        badges +=
          '<span class="badge bg-info text-dark me-1">Immagine in generazione...</span>';
      } else if (ans.imageStatus === 'error') {
        badges +=
          '<span class="badge bg-dark me-1">Errore generazione immagine</span>';
      }

      let submittedLine = '';
      if (ans.submittedAt) {
        submittedLine =
          'Inviata alle ' + ans.submittedAt.toLocaleTimeString();
      }

      let imageBlock = '';
      if (ans.imagePath && ans.imageStatus === 'ok') {
        imageBlock = `
          <div class="mt-2">
            <img
              src="${escapeHtml(ans.imagePath)}"
              alt="Immagine generata"
              class="img-fluid rounded border"
            />
          </div>
        `;
      }

      col.innerHTML = `
        <div class="card h-100">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <h6 class="card-subtitle mb-0">
                ${escapeHtml(ans.playerName || 'Senza nome')}
              </h6>
              <span>${badges}</span>
            </div>
            <div class="small text-muted mb-2">
              ${submittedLine}
            </div>
            <div class="flex-grow-1">
              <p class="mb-2" style="white-space: pre-wrap;">
                ${escapeHtml(ans.text || '')}
              </p>
              ${imageBlock}
            </div>
          </div>
        </div>
      `;

      roundGalleryEl.appendChild(col);
    });
  }

  function onSaveNameClick() {
    const newName = playerNameInput.value.trim();
    if (!newName || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: 'player_rename',
        newName
      })
    );
  }

  function onSendAnswerClick() {
    sendAnswer(false);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Event listeners
  saveNameBtn.addEventListener('click', onSaveNameClick);
  sendAnswerBtn.addEventListener('click', onSendAnswerClick);

  // Enter sulla textarea -> invio (se vuoi, lo manteniamo)
  answerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.shiftKey)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      sendAnswer(false);
    }
  });

  // init
  connectWS();

  const storedName = localStorage.getItem('playerName');
  if (storedName) {
    playerNameInput.value = storedName;
  }
})();
