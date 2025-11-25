// public/js/log.js

const { createApp, ref } = Vue;

createApp({
  setup() {
    const logs = ref([]);
    const typeFilter = ref('all');
    const playerNameFilter = ref('');
    const sortDir = ref('desc');
    const limit = ref(200);

    // lista finita di tipi - puoi aggiungere/adeguare
    const knownTypes = ref([
      'connection_open',
      'connection_close',
      'admin_round_start',
      'round_start',
      'player_register',
      'player_renamed',
      'player_renamed_broadcast',
      'player_answer',
      'round_answer',
      'player_answer_too_late',
      'player_answer_duplicate',
      'score_increment',
      'score_update'
    ]);

    async function fetchLogs() {
      const params = new URLSearchParams();
      if (typeFilter.value && typeFilter.value !== 'all') {
        params.set('type', typeFilter.value);
      }
      if (playerNameFilter.value) {
        params.set('playerName', playerNameFilter.value);
      }
      params.set('sort', sortDir.value || 'desc');
      params.set('limit', limit.value || 200);

      try {
        const res = await fetch('/api/logs?' + params.toString());
        logs.value = await res.json();
      } catch (err) {
        console.error('Errore fetch logs:', err);
      }
    }

    function formatDate(dateStr) {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      return d.toLocaleString();
    }

    function prettyPayload(payload) {
      try {
        return JSON.stringify(payload || {}, null, 2);
      } catch (err) {
        return String(payload);
      }
    }

    // carico all'avvio
    fetchLogs();

    return {
      logs,
      knownTypes,
      typeFilter,
      playerNameFilter,
      sortDir,
      limit,
      fetchLogs,
      formatDate,
      prettyPayload
    };
  }
}).mount('#app');

