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

  let ws;
  let playerId = null;
  let playerName = null;
  let currentRoundId = null;
  let currentRoundDurationMs = 30000;
  let roundStartTime = null;
  let countdownInterval = null;
  let autoSendTimeout = null;
  let hasSubmitted = false;

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

    startCountdown();
    scheduleAutoSend();
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
    // potremmo fare qualcosa di extra, ma intanto confermiamo
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

  // Event listeners
  saveNameBtn.addEventListener('click', onSaveNameClick);
  sendAnswerBtn.addEventListener('click', onSendAnswerClick);

  // Enter sulla textarea -> invio (opzionale)
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

