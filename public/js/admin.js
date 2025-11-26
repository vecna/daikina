// public/js/admin.js

(function () {
  // --- Stato locale ---

  let MODEL_CONFIG = []; // verrà riempito leggendo il JSON in admin.html

  let currentTournamentName = null;
  let currentModelName = null;
  let tournaments = [];

  const modelSortState = {
    column: 'imagesPerDollar',
    direction: 'desc' // 'asc' o 'desc'
  };

  // --- Riferimenti DOM ---

  const adminAlertContainer = document.getElementById('adminAlertContainer');

  const currentTournamentLabel = document.getElementById('currentTournamentLabel');
  const currentModelLabel = document.getElementById('currentModelLabel');

  const newTournamentNameInput = document.getElementById('newTournamentName');
  const createTournamentBtn = document.getElementById('createTournamentBtn');
  const refreshTournamentsBtn = document.getElementById('refreshTournamentsBtn');
  const closeTournamentBtn = document.getElementById('closeTournamentBtn');
  const selectedTournamentLabel = document.getElementById('selectedTournamentLabel');
  const tournamentsTableBody = document.getElementById('tournamentsTableBody');

  const modelsTableBody = document.getElementById('modelsTableBody');
  const sortButtons = document.querySelectorAll('button[data-sort]');

  // --- Helpers UI ---

  function showAlert(message, type = 'info', timeoutMs = 3000) {
    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show`;
    wrapper.role = 'alert';
    wrapper.innerHTML = `
      <div>${escapeHtml(message)}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Chiudi"></button>
    `;
    adminAlertContainer.appendChild(wrapper);

    if (timeoutMs > 0) {
      setTimeout(() => {
        wrapper.classList.remove('show');
        wrapper.addEventListener('transitionend', () => wrapper.remove());
      }, timeoutMs);
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString();
  }

  // --- Caricamento iniziale ---

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      const data = await res.json();
      currentTournamentName = data.currentTournamentName || null;
      currentModelName = data.currentModelName || null;

      updateSettingsSummary();
      renderModelsTable();
      renderTournamentsTable(); // se già caricati
    } catch (err) {
      console.error('Errore loadSettings:', err);
      showAlert('Errore nel recuperare le impostazioni correnti.', 'danger');
    }
  }

  async function loadTournaments() {
    try {
      const res = await fetch('/api/tournaments');
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      tournaments = await res.json();
      renderTournamentsTable();
    } catch (err) {
      console.error('Errore loadTournaments:', err);
      showAlert('Errore nel caricare la lista tornei.', 'danger');
    }
  }

  // --- Render tournaments ---

  function renderTournamentsTable() {
    tournamentsTableBody.innerHTML = '';

    if (!tournaments || tournaments.length === 0) {
      tournamentsTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="text-muted small">
            Nessun torneo trovato.
          </td>
        </tr>
      `;
      selectedTournamentLabel.textContent = '-';
      return;
    }

    tournaments.forEach((t) => {
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.dataset.name = t.name;

      if (t.name === currentTournamentName) {
        tr.classList.add('table-primary', 'active');
        selectedTournamentLabel.textContent = t.name;
      }

      const statusBadge = t.isClosed
        ? '<span class="badge bg-secondary small-badge">Chiuso</span>'
        : '<span class="badge bg-success small-badge">Aperto</span>';

      tr.innerHTML = `
        <td>${escapeHtml(t.name)}</td>
        <td>${statusBadge}</td>
        <td>${formatDate(t.createdAt)}</td>
      `;

      tournamentsTableBody.appendChild(tr);
    });

    if (!currentTournamentName) {
      selectedTournamentLabel.textContent = '-';
    }
  }

  // --- Render models ---

  function renderModelsTable() {
    modelsTableBody.innerHTML = '';

    const arr = MODEL_CONFIG.slice();

    if (arr.length === 0) {
      modelsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-muted small">
            Nessun modello configurato (controlla il JSON in &lt;script id="model-config"&gt;).
          </td>
        </tr>
      `;
      return;
    }

    arr.sort((a, b) => {
      const col = modelSortState.column;
      const dir = modelSortState.direction === 'asc' ? 1 : -1;

      if (col === 'imagesPerDollar' || col === 'cost') {
        const va = Number(a[col] || 0);
        const vb = Number(b[col] || 0);
        if (va === vb) return 0;
        return va < vb ? -1 * dir : 1 * dir;
      }

      if (col === 'updated') {
        const da = new Date(a.updated);
        const db = new Date(b.updated);
        if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) {
          return 0;
        }
        if (da.getTime() === db.getTime()) return 0;
        return da.getTime() < db.getTime() ? -1 * dir : 1 * dir;
      }

      return 0;
    });

    arr.forEach((m) => {
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.dataset.model = m.model;

      if (m.model === currentModelName) {
        tr.classList.add('table-primary', 'active');
      }

      tr.innerHTML = `
        <td>
          <code>${escapeHtml(m.model)}</code>
          ${
            m.model === currentModelName
              ? '<span class="badge bg-primary small-badge ms-1">Selezionato</span>'
              : ''
          }
        </td>
        <td class="text-end">${(m.imagesPerDollar ?? 0).toFixed(2)}</td>
        <td class="text-end">${(m.cost ?? 0).toFixed(2)}</td>
        <td>${escapeHtml(m.updated)}</td>
        <td class="small">${escapeHtml(m.description || '')}</td>
        <td>
          <a
            href="${escapeHtml(m.page)}"
            target="_blank"
            rel="noopener noreferrer"
            class="small"
          >
            Apri
          </a>
        </td>
      `;

      modelsTableBody.appendChild(tr);
    });
  }

  function updateSettingsSummary() {
    currentTournamentLabel.textContent =
      currentTournamentName || '(nessuno)';
    currentModelLabel.textContent =
      currentModelName || '(predefinito / non impostato)';
  }

  // --- Azioni tornei ---

  async function onCreateTournamentClick() {
    const name = newTournamentNameInput.value.trim();
    if (!name) {
      showAlert('Inserisci un nome per il torneo.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + text);
      }

      const tournament = await res.json();

      await updateSettings({
        currentTournamentName: tournament.name
      });

      newTournamentNameInput.value = '';
      showAlert(`Torneo "${tournament.name}" creato e selezionato.`, 'success');

      await loadTournaments();
    } catch (err) {
      console.error('Errore creazione torneo:', err);
      showAlert('Errore nella creazione del torneo.', 'danger');
    }
  }

  async function onTournamentsTableClick(event) {
    const row = event.target.closest('tr.clickable-row');
    if (!row) return;

    const name = row.dataset.name;
    if (!name) return;

    try {
      await updateSettings({
        currentTournamentName: name
      });

      showAlert(`Torneo corrente impostato su "${name}".`, 'success');

      currentTournamentName = name;
      updateSettingsSummary();

      tournamentsTableBody
        .querySelectorAll('tr.clickable-row')
        .forEach((tr) => tr.classList.remove('table-primary', 'active'));

      row.classList.add('table-primary', 'active');
      selectedTournamentLabel.textContent = name;
    } catch (err) {
      console.error('Errore selezione torneo:', err);
      showAlert('Errore nell\'impostare il torneo corrente.', 'danger');
    }
  }

  async function onCloseTournamentClick() {
    const name = selectedTournamentLabel.textContent.trim();
    if (!name || name === '-' || !tournaments.length) {
      showAlert('Nessun torneo selezionato da chiudere.', 'warning');
      return;
    }

    const confirmed = window.confirm(
      `Sei sicuro di voler chiudere il torneo "${name}"?\nNon sarà più possibile avviare nuovi round su questo torneo.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/tournaments/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + text);
      }

      await res.json();

      showAlert(`Torneo "${name}" chiuso.`, 'info');

      await loadTournaments();
    } catch (err) {
      console.error('Errore chiusura torneo:', err);
      showAlert('Errore nella chiusura del torneo.', 'danger');
    }
  }

  async function updateSettings(partial) {
    const body = {};
    if (typeof partial.currentTournamentName === 'string') {
      body.currentTournamentName = partial.currentTournamentName;
    }
    if (typeof partial.currentModelName === 'string') {
      body.currentModelName = partial.currentModelName;
    }

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + text);
    }
    const data = await res.json();

    currentTournamentName = data.currentTournamentName || null;
    currentModelName = data.currentModelName || null;

    updateSettingsSummary();
  }

  // --- Azioni modello ---

  async function onModelsTableClick(event) {
    const row = event.target.closest('tr.clickable-row');
    if (!row) return;

    const modelName = row.dataset.model;
    if (!modelName) return;

    try {
      await updateSettings({
        currentModelName: modelName
      });

      showAlert(`Modello corrente impostato su "${modelName}".`, 'success');

      modelsTableBody
        .querySelectorAll('tr.clickable-row')
        .forEach((tr) => tr.classList.remove('table-primary', 'active'));

      row.classList.add('table-primary', 'active');
    } catch (err) {
      console.error('Errore selezione modello:', err);
      showAlert('Errore nell\'impostare il modello corrente.', 'danger');
    }
  }

  function onSortButtonClick(event) {
    const btn = event.target.closest('button[data-sort]');
    if (!btn) return;

    const column = btn.dataset.sort;
    if (!column) return;

    if (modelSortState.column === column) {
      modelSortState.direction =
        modelSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      modelSortState.column = column;
      if (column === 'imagesPerDollar') {
        modelSortState.direction = 'desc';
      } else if (column === 'cost') {
        modelSortState.direction = 'asc';
      } else if (column === 'updated') {
        modelSortState.direction = 'desc';
      } else {
        modelSortState.direction = 'asc';
      }
    }

    sortButtons.forEach((b) => {
      if (b.dataset.sort === column) {
        b.classList.add('btn-secondary');
        b.classList.remove('btn-outline-secondary');
      } else {
        b.classList.remove('btn-secondary');
        b.classList.add('btn-outline-secondary');
      }
    });

    renderModelsTable();
  }

  // --- Event listeners ---

  createTournamentBtn.addEventListener('click', onCreateTournamentClick);
  refreshTournamentsBtn.addEventListener('click', loadTournaments);
  closeTournamentBtn.addEventListener('click', onCloseTournamentClick);
  tournamentsTableBody.addEventListener('click', onTournamentsTableClick);

  modelsTableBody.addEventListener('click', onModelsTableClick);
  sortButtons.forEach((btn) =>
    btn.addEventListener('click', onSortButtonClick)
  );

  // --- Init ---

  (function init() {
    // Carica JSON modelli dal <script id="model-config">
    const configScript = document.getElementById('model-config');
    if (configScript) {
      try {
        MODEL_CONFIG = JSON.parse(configScript.textContent);
      } catch (err) {
        console.error('Errore parsing model-config JSON:', err);
        showAlert(
          'Errore nel JSON dei modelli (script id="model-config").',
          'danger',
          0
        );
        MODEL_CONFIG = [];
      }
    } else {
      showAlert(
        'JSON dei modelli non trovato (script id="model-config").',
        'warning',
        0
      );
      MODEL_CONFIG = [];
    }

    // Setup bottoni di sort (default: imagesPerDollar)
    sortButtons.forEach((btn) => {
      btn.classList.add('btn-outline-secondary');
      btn.classList.remove('btn-secondary');
    });
    const defaultSortBtn = document.querySelector(
      'button[data-sort="imagesPerDollar"]'
    );
    if (defaultSortBtn) {
      defaultSortBtn.classList.remove('btn-outline-secondary');
      defaultSortBtn.classList.add('btn-secondary');
    }

    // Carica settings (torneo + modello) e lista tornei
    loadSettings();
    loadTournaments();
  })();
})();

