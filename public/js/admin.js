// public/js/admin.js

(function () {
  const startRoundBtn = document.getElementById('startRoundBtn');
  const adminTextEl = document.getElementById('adminText');
  const currentRoundNumberEl = document.getElementById('currentRoundNumber');
  const roundCountdownEl = document.getElementById('roundCountdown');
  const answersContainer = document.getElementById('answersContainer');
  const scoreListEl = document.getElementById('scoreList');

  let ws;
  let currentRoundId = null;
  let currentRoundDurationMs = 30000;
  let countdownInterval = null;
  let roundStartTime = null;

  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws`);

    ws.addEventListener('open', () => {
      console.log('WS admin connesso');
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
        default:
          break;
      }
    });

    ws.addEventListener('close', () => {
      console.log('WS chiuso, provo a riconnettere fra poco...');
      setTimeout(connectWS, 3000);
    });
  }

  function handleRoundStart(msg) {
    currentRoundId = msg.roundId;
    currentRoundDurationMs = msg.durationMs || 30000;
    roundStartTime = new Date(msg.startTime);

    currentRoundNumberEl.textContent = msg.roundNumber;
    answersContainer.innerHTML = ''; // pulisco risposte
    startCountdown();
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

  function handleRoundAnswer(msg) {
    const key = msg.playerName || msg.playerId;
    const existing = document.querySelector(
      `[data-player-key="${CSS.escape(key)}"]`
    );

    const cardHtml = `
      <div class="card h-100">
        <div class="card-body d-flex flex-column">
          <h6 class="card-subtitle mb-2 text-muted">
            ${msg.playerName || 'Senza nome'}
          </h6>
          <p class="card-text flex-grow-1" style="white-space: pre-wrap;">${escapeHtml(
            msg.text || ''
          )}</p>
          <div class="mt-2 small text-muted">
            Inviata: ${new Date(msg.submittedAt).toLocaleTimeString()}<br>
            ${
              msg.submittedByTimeout
                ? '<span class="badge bg-warning text-dark">Auto (timeout)</span> '
                : ''
            }
            ${
              msg.late
                ? '<span class="badge bg-danger">Oltre i 30s (ma entro tolleranza)</span>'
                : ''
            }
          </div>
          <button
            class="btn btn-sm btn-success mt-3 assign-win-btn"
            data-player-name="${encodeURIComponent(
              msg.playerName || 'Senza nome'
            )}"
          >
            Assegna vittoria (+1)
          </button>
        </div>
      </div>
    `;

    const col = existing || document.createElement('div');
    col.className = 'col-md-6';
    col.dataset.playerKey = key;
    col.innerHTML = cardHtml;

    if (!existing) {
      answersContainer.appendChild(col);
    }
  }

  function handleScoreUpdate(msg) {
    // aggiorno / inserisco nella lista punteggi
    const { playerName, score } = msg;
    const liId = `score-${playerName}`;
    let li = document.getElementById(liId);
    if (!li) {
      li = document.createElement('li');
      li.id = liId;
      li.className =
        'list-group-item d-flex justify-content-between align-items-center';
      scoreListEl.appendChild(li);
    }
    li.innerHTML = `
      <span>${escapeHtml(playerName)}</span>
      <span class="badge bg-primary rounded-pill">${score}</span>
    `;
  }

  async function loadScores() {
    try {
      const res = await fetch('/api/scores');
      const scores = await res.json();
      scoreListEl.innerHTML = '';
      scores.forEach((s) => {
        handleScoreUpdate({ type: 'score_update', playerName: s.playerName, score: s.score });
      });
    } catch (err) {
      console.error('Errore caricamento punteggi:', err);
    }
  }

  function onStartRoundClick() {
    const text = adminTextEl.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: 'admin_round_start',
        text
      })
    );
  }

  async function onAssignWinClick(event) {
    const btn = event.target.closest('.assign-win-btn');
    if (!btn) return;

    const playerName = decodeURIComponent(btn.dataset.playerName || '');
    if (!playerName) return;

    try {
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Event listeners
  startRoundBtn.addEventListener('click', onStartRoundClick);
  answersContainer.addEventListener('click', onAssignWinClick);

  // init
  connectWS();
  loadScores();
})();

