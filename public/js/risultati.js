// public/js/risultati.js
// -------------------------------------------
// Pagina di storico risultati round
// Usa l'API GET /api/rounds (già implementata lato server)
// per caricare i round recenti e mostrarli in una accordion.
// -------------------------------------------

(function () {
  const roundsContainer = document.getElementById('roundsContainer');
  const limitInput = document.getElementById('limitInput');
  const playerFilterInput = document.getElementById('playerFilterInput');
  const winnerOnlyCheckbox = document.getElementById('winnerOnlyCheckbox');
  const applyFiltersBtn = document.getElementById('applyFiltersBtn');

  let allRounds = []; // memorizza l'ultima risposta dell'API

  // Escape basico per sicurezza
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Carica i round dal server
  async function loadRounds() {
    const limit = parseInt(limitInput.value, 10) || 20;

    try {
      const res = await fetch('/api/rounds?limit=' + limit);
      if (!res.ok) {
        console.error('Errore risposta /api/rounds', await res.text());
        return;
      }

      allRounds = await res.json();
      renderRounds();
    } catch (err) {
      console.error('Errore fetch /api/rounds:', err);
    }
  }

  // Applica filtri lato client (per nome giocatore, vincitori, ecc.)
  function getFilteredRounds() {
    const playerFilter = (playerFilterInput.value || '').trim().toLowerCase();
    const winnerOnly = winnerOnlyCheckbox.checked;

    return allRounds.filter((round) => {
      // Filtro: solo round con vincitori
      if (winnerOnly && (!round.winnerNames || round.winnerNames.length === 0)) {
        return false;
      }

      // Filtro per nome giocatore:
      if (playerFilter) {
        const inWinners =
          Array.isArray(round.winnerNames) &&
          round.winnerNames.some((name) =>
            String(name).toLowerCase().includes(playerFilter)
          );

        const inAnswers =
          Array.isArray(round.answers) &&
          round.answers.some((ans) =>
            String(ans.playerName || '')
              .toLowerCase()
              .includes(playerFilter)
          );

        if (!inWinners && !inAnswers) {
          return false;
        }
      }

      return true;
    });
  }

  // Renderizza i round all'interno di una accordion Bootstrap
  function renderRounds() {
    const rounds = getFilteredRounds();

    if (rounds.length === 0) {
      roundsContainer.innerHTML =
        '<div class="alert alert-secondary mb-0">Nessun round trovato con i filtri correnti.</div>';
      return;
    }

    roundsContainer.innerHTML = '';

    rounds.forEach((round, idx) => {
      const collapseId = `round-collapse-${idx}`;
      const headingId = `round-heading-${idx}`;

      const start = round.startTime ? new Date(round.startTime) : null;
      const startText = start ? start.toLocaleString() : '-';

      const answers = round.answers || [];
      const winners = round.winnerNames || [];

      // Piccolo snippet del testo admin
      const adminSnippet =
        (round.adminText || '').length > 80
          ? round.adminText.slice(0, 80) + '...'
          : round.adminText || '';

      const answersCount = answers.length;

      const winnersText =
        winners.length > 0
          ? winners.map((w) => escapeHtml(w)).join(', ')
          : '<span class="text-muted">Nessun vincitore associato</span>';

      const card = document.createElement('div');
      card.className = 'accordion-item';

      card.innerHTML = `
        <h2 class="accordion-header" id="${headingId}">
          <button
            class="accordion-button collapsed"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#${collapseId}"
            aria-expanded="false"
            aria-controls="${collapseId}"
          >
            <div class="d-flex flex-column w-100">
              <div class="d-flex justify-content-between">
                <div>
                  <span class="badge bg-secondary me-2">Round #${
                    round.roundNumber || '-'
                  }</span>
                  <strong>${escapeHtml(adminSnippet)}</strong>
                </div>
                <div class="text-end">
                  <small class="text-muted d-block">${startText}</small>
                  <small class="text-muted">Risposte: ${answersCount}</small>
                </div>
              </div>
              <div class="mt-1">
                <small>Vincitori: ${winnersText}</small>
              </div>
            </div>
          </button>
        </h2>
        <div
          id="${collapseId}"
          class="accordion-collapse collapse"
          aria-labelledby="${headingId}"
          data-bs-parent="#roundsContainer"
        >
          <div class="accordion-body">
            ${renderRoundDetails(round)}
          </div>
        </div>
      `;

      roundsContainer.appendChild(card);
    });
  }

  // Genera HTML dei dettagli di un singolo round
  function renderRoundDetails(round) {
    const answers = round.answers || [];

    if (answers.length === 0) {
      return `
        <p class="text-muted mb-0">
          Nessuna risposta registrata per questo round.
        </p>
      `;
    }

    // Tabella con tutte le risposte
    const rowsHtml = answers
      .map((ans) => {
        const submittedAt = ans.submittedAt
          ? new Date(ans.submittedAt).toLocaleString()
          : '-';

        const flags = [];
        if (ans.submittedByTimeout) {
          flags.push('Auto (timeout)');
        }
        if (ans.late) {
          flags.push('Oltre i 30s (entro tolleranza)');
        }

        return `
          <tr>
            <td>${escapeHtml(ans.playerName || 'Senza nome')}</td>
            <td>${submittedAt}</td>
            <td>${escapeHtml((ans.text || '').slice(0, 120))}${
          (ans.text || '').length > 120 ? '…' : ''
        }</td>
            <td>${flags.length ? flags.join(', ') : '-'}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="mb-2">
        <strong>Testo admin:</strong>
        <div class="border rounded p-2 bg-light mt-1" style="white-space: pre-wrap;">
          ${escapeHtml(round.adminText || '')}
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-striped align-middle">
          <thead>
            <tr>
              <th>Giocatore</th>
              <th>Inviata</th>
              <th>Risposta</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  // --- EVENT LISTENERS ---

  applyFiltersBtn.addEventListener('click', () => {
    // Ricarichiamo dal server con il nuovo "limit"
    loadRounds();
  });

  // Se l'utente cambia solo i filtri locali (player / winner only),
  // possiamo anche solo ri-renderizzare senza richiamare l'API.
  playerFilterInput.addEventListener('input', () => {
    renderRounds();
  });

  winnerOnlyCheckbox.addEventListener('change', () => {
    renderRounds();
  });

  // --- INIT ---

  // Per la accordion funziona anche senza JS di Bootstrap, ma se vuoi
  // un comportamento perfetto puoi includere lo script di Bootstrap.
  // Qui ci limitiamo a usare il markup.

  loadRounds();
})();

