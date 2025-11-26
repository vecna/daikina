// api.js
const path = require('path');
const debugAPI = require('debug')('server:api');

/**
 * Registra tutte le route HTTP dell'API.
 */
function registerApiRoutes({
  app,
  Round,
  Score,
  EventLog,
  Tournament,
  Settings,
  state,
  utils
}) {
  const { logEvent, broadcast } = utils;

  // --- SCOREBOARD ---

  app.get('/api/scores', async (req, res) => {
    try {
      const { tournament } = req.query;
      const filter = {};

      if (tournament === 'null') {
        filter.tournamentName = null;
      } else if (tournament) {
        filter.tournamentName = tournament;
      }

      const scores = await Score.find(filter)
        .sort({ score: -1, playerName: 1 })
        .lean();

      res.json(scores);
    } catch (err) {
      debugAPI('Errore GET /api/scores:', err);
      res.status(500).json({ error: 'Errore caricamento punteggi' });
    }
  });

  app.post('/api/scores/increment', async (req, res) => {
    try {
      const { playerName, roundId } = req.body || {};
      if (!playerName) {
        return res
          .status(400)
          .json({ error: 'playerName è obbligatorio' });
      }

      let tournamentName = state.currentTournamentName || null;

      if (roundId) {
        const round = await Round.findById(roundId).lean();
        if (round && round.tournamentName) {
          tournamentName = round.tournamentName;
        }
      }

      const score = await Score.findOneAndUpdate(
        { tournamentName, playerName },
        { $inc: { score: 1 } },
        { upsert: true, new: true }
      );

      if (roundId) {
        await Round.updateOne(
          { _id: roundId },
          { $addToSet: { winnerNames: playerName } }
        );
      }

      await logEvent({
        type: 'score_increment',
        direction: 'server->client',
        role: 'admin',
        playerName,
        connectionId: 'http-api',
        payload: {
          roundId,
          tournamentName,
          score: score.score
        }
      });

      const msgOut = {
        type: 'score_update',
        tournamentName,
        playerName,
        score: score.score
      };

      broadcast(null, msgOut);

      res.json(score);
    } catch (err) {
      debugAPI('Errore POST /api/scores/increment:', err);
      res.status(500).json({ error: 'Errore incremento punteggio' });
    }
  });

  // --- ROUND HISTORY ---

  app.get('/api/rounds', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const sortDir = req.query.sort === 'asc' ? 1 : -1;
      const { tournament } = req.query;

      const filter = {};
      if (tournament) {
        filter.tournamentName = tournament;
      }

      const rounds = await Round.find(filter)
        .sort({ startTime: sortDir })
        .limit(limit)
        .lean();

      res.json(rounds);
    } catch (err) {
      debugAPI('Errore GET /api/rounds:', err);
      res.status(500).json({ error: 'Errore caricamento round' });
    }
  });

  // --- EVENT LOG ---

  app.get('/api/logs', async (req, res) => {
    try {
      const { type, playerName, limit } = req.query;
      const max = parseInt(limit, 10) || 100;

      const filter = {};
      if (type) {
        filter.type = type;
      }
      if (playerName) {
        filter.playerName = { $regex: playerName, $options: 'i' };
      }

      const logs = await EventLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(max)
        .lean();

      res.json(logs);
    } catch (err) {
      debugAPI('Errore GET /api/logs:', err);
      res.status(500).json({ error: 'Errore caricamento log' });
    }
  });

  // --- TOURNAMENTS ---

  app.get('/api/tournaments', async (req, res) => {
    try {
      const tournaments = await Tournament.find({})
        .sort({ createdAt: -1 })
        .lean();

      res.json(tournaments);
    } catch (err) {
      debugAPI('Errore GET /api/tournaments:', err);
      res.status(500).json({ error: 'Errore caricamento tornei' });
    }
  });

  app.post('/api/tournaments', async (req, res) => {
    try {
      const { name } = req.body || {};
      const trimmed = (name || '').trim();

      if (!trimmed) {
        return res
          .status(400)
          .json({ error: 'name è obbligatorio' });
      }

      let tournament = await Tournament.findOne({ name: trimmed });

      if (!tournament) {
        tournament = await Tournament.create({
          name: trimmed,
          isClosed: false
        });
      }

      res.json(tournament);
    } catch (err) {
      debugAPI('Errore POST /api/tournaments:', err);
      res.status(500).json({ error: 'Errore creazione torneo' });
    }
  });

  app.post('/api/tournaments/close', async (req, res) => {
    try {
      const { name } = req.body || {};
      const trimmed = (name || '').trim();

      if (!trimmed) {
        return res
          .status(400)
          .json({ error: 'name è obbligatorio' });
      }

      const tournament = await Tournament.findOneAndUpdate(
        { name: trimmed },
        { $set: { isClosed: true } },
        { new: true }
      );

      if (!tournament) {
        return res
          .status(404)
          .json({ error: 'Torneo non trovato' });
      }

      res.json(tournament);
    } catch (err) {
      debugAPI('Errore POST /api/tournaments/close:', err);
      res.status(500).json({ error: 'Errore chiusura torneo' });
    }
  });

  // --- SETTINGS GLOBALI (torneo corrente + modello corrente) ---

  app.get('/api/settings', (req, res) => {
    res.json({
      currentTournamentName: state.currentTournamentName,
      currentModelName: state.currentModelName
    });
  });

  app.post('/api/settings', async (req, res) => {
    try {
      const { currentTournamentName, currentModelName } = req.body || {};

      let newTournamentName = state.currentTournamentName;
      let newTournamentId = state.currentTournamentId;
      let newModelName = state.currentModelName;

      if (typeof currentTournamentName === 'string') {
        const nameTrim = currentTournamentName.trim();
        if (!nameTrim) {
          return res
            .status(400)
            .json({ error: 'currentTournamentName non valido' });
        }

        let t = await Tournament.findOne({ name: nameTrim });
        if (!t) {
          t = await Tournament.create({
            name: nameTrim,
            isClosed: false
          });
        }

        newTournamentName = t.name;
        newTournamentId = t._id;
      }

      if (typeof currentModelName === 'string') {
        newModelName = currentModelName.trim() || null;
      }

      await Settings.updateOne(
        {},
        {
          currentTournamentName: newTournamentName,
          currentModelName: newModelName
        },
        { upsert: true }
      );

      state.currentTournamentName = newTournamentName;
      state.currentTournamentId = newTournamentId;
      state.currentModelName = newModelName;

      res.json({
        currentTournamentName: newTournamentName,
        currentModelName: newModelName
      });
    } catch (err) {
      debugAPI('Errore POST /api/settings:', err);
      res.status(500).json({ error: 'Errore aggiornamento settings' });
    }
  });

  // (opzionale) root, se hai una index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

module.exports = {
  registerApiRoutes
};
