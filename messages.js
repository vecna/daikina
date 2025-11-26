// messages.js
const debugMessages = require('debug')('server:messages');

/**
 * Crea gli handler per i messaggi WebSocket.
 * @param {Object} deps
 * @param {Object} deps.state
 * @param {Object} deps.Round
 * @param {Object} deps.Tournament
 * @param {Object} deps.utils
 * @param {Object} deps.imageService
 */
function createMessageHandlers({ state, Round, Tournament, utils, imageService }) {
  const { logEvent, sendTo, broadcast, broadcastPlayerListToAdmins } = utils;
  const { queueImageGeneration } = imageService;

  async function onMessage(ws, rawData) {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch (err) {
      debugMessages('Messaggio non JSON ricevuto:', err);
      return;
    }

    const client = state.clients.get(ws);
    if (!client) {
      debugMessages(
        'Messaggio ricevuto da client sconosciuto (probabilmente già chiuso).'
      );
      return;
    }

    await logEvent({
      type: msg.type || 'unknown',
      direction: 'client->server',
      role: client.role,
      playerName: client.playerName,
      connectionId: client.id,
      payload: msg
    });

    debugMessages(`Messaggio ricevuto da ${client.id}: ${msg.type}`);

    switch (msg.type) {
      case 'admin_register':
        handleAdminRegister(ws, client, msg);
        break;

      case 'player_register':
        handlePlayerRegister(ws, client, msg);
        break;

      case 'player_rename':
        handlePlayerRename(ws, client, msg);
        break;

      case 'player_answer':
        await handlePlayerAnswer(ws, client, msg);
        break;

      case 'admin_round_start':
        await handleAdminRoundStart(ws, client, msg);
        break;

      default:
        debugMessages('Tipo messaggio sconosciuto:', msg.type);
        break;
    }
  }

  function onClose(ws) {
    const client = state.clients.get(ws);
    if (!client) {
      return;
    }

    debugMessages(`Connessione chiusa: ${client.id}`);

    logEvent({
      type: 'connection_close',
      direction: 'client->server',
      role: client.role,
      playerName: client.playerName,
      connectionId: client.id,
      payload: {}
    });

    state.clients.delete(ws);

    if (client.role === 'player') {
      broadcastPlayerListToAdmins();
    }
  }

  // --- Admin ---

  function handleAdminRegister(ws, client, msg) {
    client.role = 'admin';
    debugMessages(`Admin registrato: ${client.id}`);

    broadcastPlayerListToAdmins();
  }

  async function handleAdminRoundStart(ws, client, msg) {
    client.role = 'admin';

    const text = (msg.text || '').trim();
    if (!text) return;

    const tournamentName =
      state.currentTournamentName || 'Default Tournament';
    const tournamentId = state.currentTournamentId || null;

    // Se il torneo è chiuso o non esiste, rifiutiamo
    if (tournamentId) {
      const t = await Tournament.findById(tournamentId).lean();
      if (!t || t.isClosed) {
        sendTo(ws, {
          type: 'round_start_rejected',
          reason: 'tournament_closed_or_missing',
          tournamentName
        });
        return;
      }
    }

    state.currentRound = null;

    const now = new Date();
    const durationMs = 30000;
    const toleranceMs = 5000;

    const roundDoc = await Round.create({
      roundNumber: state.roundCounter++,
      adminText: text,
      startTime: now,
      durationMs,
      toleranceMs,
      tournament: tournamentId,
      tournamentName,
      modelName: state.currentModelName || null,
      answers: []
    });

    state.currentRound = {
      dbId: roundDoc._id,
      roundNumber: roundDoc.roundNumber,
      adminText: text,
      startTime: now,
      durationMs,
      toleranceMs,
      tournament: tournamentId,
      tournamentName,
      modelName: state.currentModelName || null
    };

    debugMessages(
      `Nuovo round avviato: #${roundDoc.roundNumber} (tournament=${tournamentName})`
    );

    const msgOut = {
      type: 'round_start',
      roundId: String(roundDoc._id),
      roundNumber: roundDoc.roundNumber,
      text,
      durationMs,
      toleranceMs,
      startTime: now.toISOString(),
      tournamentName,
      modelName: state.currentModelName || null
    };

    broadcast(null, msgOut);
  }

  // --- Player ---

  function handlePlayerRegister(ws, client, msg) {
    client.role = 'player';

    let nameFromClient = (msg.playerName || '').trim();
    if (!nameFromClient) {
      nameFromClient = `Giocatore ${state.nextPlayerNumber++}`;
    }

    client.playerName = nameFromClient;

    const response = {
      type: 'player_registered',
      playerId: client.id,
      playerName: client.playerName
    };
    sendTo(ws, response);

    debugMessages(`Registrato nuovo player: ${client.id} (${client.playerName})`);

    broadcastPlayerListToAdmins();
  }

  function handlePlayerRename(ws, client, msg) {
    if (client.role !== 'player') client.role = 'player';

    const newName = (msg.newName || '').trim();
    if (!newName) return;

    client.playerName = newName;

    const response = {
      type: 'player_renamed',
      playerId: client.id,
      playerName: client.playerName
    };

    sendTo(ws, response);

    debugMessages(`Player rinominato: ${client.id} -> ${client.playerName}`);

    // Notifichiamo gli admin del cambio nome
    broadcast(
      (c) => c.role === 'admin',
      {
        type: 'player_renamed_broadcast',
        playerId: client.id,
        playerName: client.playerName
      }
    );

    broadcastPlayerListToAdmins();
  }

  async function handlePlayerAnswer(ws, client, msg) {
    if (!state.currentRound) {
      sendTo(ws, { type: 'answer_rejected', reason: 'no_active_round' });
      return;
    }

    if (msg.roundId !== String(state.currentRound.dbId)) {
      sendTo(ws, { type: 'answer_rejected', reason: 'wrong_round' });
      return;
    }

    const now = new Date();
    const diffMs = now - state.currentRound.startTime;
    const { durationMs, toleranceMs } = state.currentRound;

    if (diffMs > durationMs + toleranceMs) {
      await logEvent({
        type: 'player_answer_too_late',
        direction: 'client->server',
        role: client.role,
        playerName: client.playerName,
        connectionId: client.id,
        payload: msg
      });

      sendTo(ws, {
        type: 'answer_rejected',
        reason: 'too_late',
        maxMs: durationMs + toleranceMs,
        diffMs
      });
      return;
    }

    const playerName = client.playerName || msg.playerName || 'Senza nome';
    const playerId = client.id;
    const text = (msg.text || '').trim();
    const submittedByTimeout = !!msg.sentByTimeout;
    const late = diffMs > durationMs;

    const existing = await Round.findOne({
      _id: state.currentRound.dbId,
      'answers.playerName': playerName
    }).lean();

    if (existing) {
      await logEvent({
        type: 'player_answer_duplicate',
        direction: 'client->server',
        role: client.role,
        playerName,
        connectionId: client.id,
        payload: msg
      });
      return;
    }

    const answer = {
      playerName,
      playerId,
      text,
      submittedAt: now,
      submittedByTimeout,
      late,
      tournament: state.currentRound.tournament || null,
      tournamentName: state.currentRound.tournamentName || null,
      imagePath: null,
      imageStatus: 'pending',
      imageError: null,
      modelName: null
    };

    await Round.updateOne(
      { _id: state.currentRound.dbId },
      { $push: { answers: answer } }
    );

    const msgOut = {
      type: 'round_answer',
      roundId: String(state.currentRound.dbId),
      roundNumber: state.currentRound.roundNumber,
      playerName,
      playerId,
      text,
      submittedAt: now.toISOString(),
      submittedByTimeout,
      late,
      imageStatus: 'pending',
      tournamentName: state.currentRound.tournamentName || null
    };

    // Admin + tutti i player vedono il testo della risposta
    broadcast(
      (c) => c.role === 'admin' || c.role === 'player',
      msgOut
    );

    sendTo(ws, {
      type: 'answer_accepted',
      roundId: String(state.currentRound.dbId),
      submittedAt: now.toISOString(),
      late
    });

    // Avvio generazione immagine (modello letto da state.currentModelName)
    queueImageGeneration({
      roundId: state.currentRound.dbId,
      roundNumber: state.currentRound.roundNumber,
      playerId,
      playerName,
      prompt: text
    });
  }

  return {
    onMessage,
    onClose
  };
}

module.exports = {
  createMessageHandlers
};
