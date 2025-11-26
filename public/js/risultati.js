// public/js/risultati.js

// -------------------------------------------
// Pagina di storico risultati round
// Usa l'API GET /api/rounds (API lato server)
// per caricare i round recenti e mostrarli in una accordion.
// -------------------------------------------
(function () {
  const limitInput = document.getElementById('limitInput');
  const sortInput = document.getElementById('sortInput');
  const winnerFilterInput = document.getElementById('winnerFilterInput');
  const applyBtn = document.getElementById('applyBtn');
  const roundsContainer = document.getElementById('roundsContainer');

  // Carica i round dall'API /api/rounds
  async function fetchRounds() {
    const limit = parseInt(limitInput.value, 10) || 20;
    const sort = sortInput.value || 'desc';
    const winnerFilter = winnerFilterInput.value.trim();

    const params = new URLSearchParams();
    params.set('limit', limit);
    params.set('sort', sort);

    try {
      const res = await fetch('/api/rounds?' + params.toString());
      const rounds = await res.json();

      // Filtro per vincitore lato client (se impostato)
      const filtered = winnerFilter
        ? rounds.filter((r) =>
            Array.isArray(r.winnerNames)
              ? r.winnerNames.some((name) =>
                  (name || '')
                    .toLowerCase()
                    .includes(winnerFilter.toLowerCase())
                )
              : false
          )
        : rounds;

      renderRounds(filtered);
    } catch (err) {
      console.error('Errore caricamento round:', err);
      roundsContainer.innerHTML =
        '<div class="alert alert-danger">Errore durante il caricamento dei risultati.</div>';
    }
  }

  // Renderizza l'elenco dei round
  function renderRounds(rounds) {
    roundsContainer.innerHTML = '';

    if (!rounds || rounds.length === 0) {
      roundsContainer.innerHTML =
        '<p class="text-muted">Nessun round trovato.</p>';
      return;
    }

    rounds.forEach((round) => {
      const card = document.createElement('div');
      card.className = 'card';

      const startTime = round.startTime
        ? new Date(round.startTime)
        : null;

      const startStr = startTime ? startTime.toLocaleString() : '-';
      const winnerNames =
        Array.isArray(round.winnerNames) && round.winnerNames.length > 0
          ? round.winnerNames
          : [];

      const winnersLabel =
        winnerNames.length > 0
          ? winnerNames.join(', ')
          : 'Nessun vincitore registrato';

      const answersCount = Array.isArray(round.answers)
        ? round.answers.length
        : 0;

      const adminText = round.adminText || '';
      const adminSnippet =
        adminText.length > 120
          ? adminText.slice(0, 120) + '...'
          : adminText;

      // Troviamo eventuale risposta vincente con immagine
      let winnerImageHTML = '';
      if (winnerNames.length > 0 && Array.isArray(round.answers)) {
        const winningAnswers = round.answers.filter(
          (a) =>
            a &&
            winnerNames.includes(a.playerName) &&
            a.imagePath &&
            a.imageStatus === 'ok'
        );
        if (winningAnswers.length > 0) {
          const wa = winningAnswers[0];
          const labelName = wa.playerName || 'Senza nome';
          const promptText = wa.text || '';

          winnerImageHTML = `
            <div class="mt-2">
              <p class="mb-1">
                <strong>Immagine vincitrice</strong><br />
                <span class="text-muted">Prompt di ${escapeHtml(
                  labelName
                )}</span>
              </p>
              <div class="mb-2">
                <img
                  src="${escapeHtml(wa.imagePath)}"
                  alt="Immagine vincitrice"
                  class="img-fluid rounded border"
                />
              </div>
              <p class="small text-muted mb-0" style="white-space: pre-wrap;">
                ${escapeHtml(promptText)}
              </p>
            </div>
          `;
        } else {
          winnerImageHTML =
            '<p class="text-muted mb-0">Nessuna immagine generata per il vincitore.</p>';
        }
      } else {
        winnerImageHTML =
          '<p class="text-muted mb-0">Nessun vincitore registrato per questo round.</p>';
      }

      card.innerHTML = `
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2 round-header" style="cursor: pointer;">
            <div>
              <h5 class="card-title mb-1">
                Round #${round.roundNumber ?? '-'}
              </h5>
              <p class="card-subtitle text-muted mb-0">
                Iniziato: ${startStr}
              </p>
            </div>
            <span class="badge bg-secondary align-self-center">
              ${answersCount} risposta${answersCount === 1 ? '' : 'e'}
            </span>
          </div>

          <!-- Contenitore nascosto che mostrerà la foto vincitrice -->
          <div class="winner-image-container mt-2 d-none">
            ${winnerImageHTML}
          </div>

          <p class="mb-2 mt-2">
            <strong>Testo admin:</strong><br />
            <span class="text-muted">${escapeHtml(adminSnippet)}</span>
          </p>

          <p class="mb-2">
            <strong>Vincitori:</strong>
            <span>${escapeHtml(winnersLabel)}</span>
          </p>

          <details>
            <summary class="mb-2">Mostra tutte le risposte</summary>
            <div class="mt-2">
              ${renderAnswersList(round.answers, winnerNames)}
            </div>
          </details>
        </div>
      `;

      roundsContainer.appendChild(card);
    });
  }

  // Genera HTML per l'elenco delle risposte di un round
  function renderAnswersList(answers, winnerNames) {
    if (!Array.isArray(answers) || answers.length === 0) {
      return '<p class="text-muted mb-0">Nessuna risposta registrata per questo round.</p>';
    }

    const winnersSet = new Set(winnerNames || []);

    // Ordiniamo le risposte per tempo di invio
    const sorted = [...answers].sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return ta - tb;
    });

    const items = sorted
      .map((a) => {
        const name = a.playerName || 'Senza nome';
        const text = a.text || '';
        const submittedAt = a.submittedAt
          ? new Date(a.submittedAt).toLocaleTimeString()
          : '-';
        const badges = [];

        if (winnersSet.has(a.playerName)) {
          badges.push(
            '<span class="badge bg-success me-1">Vincitore</span>'
          );
        }

        if (a.submittedByTimeout) {
          badges.push(
            '<span class="badge bg-warning text-dark me-1">Auto (timeout)</span>'
          );
        }
        if (a.late) {
          badges.push(
            '<span class="badge bg-danger me-1">Oltre i 30s (entro tolleranza)</span>'
          );
        }
        if (a.imageStatus === 'pending') {
          badges.push(
            '<span class="badge bg-info text-dark me-1">Immagine in generazione...</span>'
          );
        } else if (a.imageStatus === 'error') {
          badges.push(
            '<span class="badge bg-dark me-1">Errore generazione immagine</span>'
          );
        }

        let imageBlock = '';
        if (a.imagePath && a.imageStatus === 'ok') {
          imageBlock = `
            <div class="mt-2">
              <img
                src="${escapeHtml(a.imagePath)}"
                alt="Immagine generata"
                class="img-fluid rounded border"
              />
            </div>
          `;
        }

        return `
          <div class="border rounded p-2 mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong>${escapeHtml(name)}</strong>
              <small class="text-muted">${submittedAt}</small>
            </div>
            <div class="mb-1" style="white-space: pre-wrap;">${escapeHtml(
              text
            )}</div>
            <div class="mb-1">
              ${badges.join(' ')}
            </div>
            ${imageBlock}
          </div>
        `;
      })
      .join('');

    return items;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Click sulla "barra" del round → toggle immagine vincitrice
  function onRoundHeaderClick(event) {
    const header = event.target.closest('.round-header');
    if (!header) return;
    const card = header.closest('.card');
    if (!card) return;
    const container = card.querySelector('.winner-image-container');
    if (!container) return;

    container.classList.toggle('d-none');
  }

  // Event listener per il bottone "Applica / Aggiorna"
  applyBtn.addEventListener('click', fetchRounds);

  // Event listener per click sui header delle card
  roundsContainer.addEventListener('click', onRoundHeaderClick);

  // Carichiamo subito all'avvio
  fetchRounds();
})();