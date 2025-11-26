const debugApi = require('debug')('server:api');

/**
 * Registra tutte le API REST sull'istanza di Express.
 * @param {Object} deps
 * @param {Object} deps.app - istanza Express
 * @param {Object} deps.Round - modello Mongoose Round
 * @param {Object} deps.Score - modello Mongoose Score
 * @param {Object} deps.EventLog - modello Mongoose EventLog
 * @param {Object} deps.utils - funzioni di utilità (broadcast, logEvent, ...)
 */
function registerApiRoutes({ app, Round, Score, EventLog, utils }) {
  const { broadcast, logEvent } = utils;

  // --- API REST: punteggi ---

  // Punteggi - lista
  app.get('/api/scores', async (req, res) => {
    debugApi('GET /api/scores');
    try {
      const scores = await Score.find()
        .sort({ score: -1, playerName: 1 })
        .lean();
      res.json(scores);
    } catch (err) {
      debugApi('Errore lettura punteggi:', err);
      res.status(500).json({ error: 'Errore lettura punteggi' });
    }
  });

  // Punteggi - incrementa (assegna vittoria)
  app.post('/api/scores/increment', async (req, res) => {
    const { playerName, roundId } = req.body || {};
    debugApi('POST /api/scores/increment', playerName, roundId);

    if (!playerName) {
      return res.status(400).json({ error: 'playerName obbligatorio' });
    }

    try {
      const score = await Score.findOneAndUpdate(
        { playerName },
        { $inc: { score: 1 } },
        { upsert: true, new: true }
      );

      // Se viene passato un roundId, registriamo il vincitore nel documento del round
      if (roundId) {
        await Round.updateOne(
          { _id: roundId },
          { $addToSet: { winnerNames: playerName } } // evita duplicati
        );
      }

      debugApi(`Assegnato punto a ${playerName} per round ${roundId || '-'}`);

      // Logghiamo anche questo evento
      await logEvent({
        type: 'score_increment',
        direction: 'client->server',
        role: 'admin',
        playerName,
        connectionId: 'http-api',
        payload: { playerName, roundId }
      });

      // broadcast aggiornamento punteggi via WS
      const msgOut = {
        type: 'score_update',
        playerName,
        score: score.score
      };
      broadcast(null, msgOut);

      res.json(score);
    } catch (err) {
      debugApi('Errore update punteggio:', err);
      res.status(500).json({ error: 'Errore update punteggio' });
    }
  });

  // --- API REST: log eventi ---

  app.get('/api/logs', async (req, res) => {
    const {
      type,
      playerName,
      sort = 'desc',
      limit = 200,
      skip = 0
    } = req.query;

    debugApi('GET /api/logs', { type, playerName, sort, limit, skip });

    const filter = {};
    if (type && type !== 'all') {
      filter.type = type;
    }
    if (playerName) {
      filter.playerName = new RegExp(playerName, 'i');
    }

    try {
      const logs = await EventLog.find(filter)
        .sort({ timestamp: sort === 'asc' ? 1 : -1 })
        .skip(parseInt(skip, 10) || 0)
        .limit(Math.min(parseInt(limit, 10) || 200, 1000))
        .lean();

      res.json(logs);
    } catch (err) {
      debugApi('Errore lettura log:', err);
      res.status(500).json({ error: 'Errore lettura log' });
    }
  });

  // --- API REST: rounds / risultati ---

  app.get('/api/rounds', async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    const sortDir = req.query.sort === 'asc' ? 1 : -1;

    debugApi('GET /api/rounds', { limit, sortDir });

    try {
      const rounds = await Round.find({})
        .sort({ startTime: sortDir })
        .limit(limit)
        .lean();
      res.json(rounds);
    } catch (err) {
      debugApi('Errore lettura round:', err);
      res.status(500).json({ error: 'Errore lettura round' });
    }
  });

  // Root redirect (pagina principale, la puoi cambiare se vuoi)
  app.get('/', (req, res) => {
    res.redirect('/index.html');
  });
}

module.exports = {
  registerApiRoutes
};

