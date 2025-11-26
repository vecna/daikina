// messages.js
const debugMessages = require('debug')('server:messages');

/**
 * Crea gli handler per i messaggi WebSocket.
 * @param {Object} deps
 * @param {Object} deps.state
 * @param {Object} deps.Round
 * @param {Object} deps.utils
 * @param {Object} deps.imageService
 */
function createMessageHandlers({ state, Round, utils, imageService }) {
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

    // Log di base dell'evento in ingresso
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

    // Loggiamo la chiusura (fire & forget)
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
      // Aggiornamento lista giocatori per tutti gli admin
      broadcastPlayerListToAdmins();
    }
  }

  // --- Admin ---

  function handleAdminRegister(ws, client, msg) {
    client.role = 'admin';
    debugMessages(`Admin registrato: ${client.id}`);

    // Inviamo la lista giocatori a TUTTI gli admin (incluso questo)
    broadcastPlayerListToAdmins();
  }

  async function handleAdminRoundStart(ws, client, msg) {
    client.role = 'admin';

    const text = (msg.text || '').trim();
    if (!text) return;

    // Se c'è già un round attivo, per semplicità lo chiudiamo "logicamente"
    state.currentRound = null;

    const now = new Date();
    const durationMs = 30000; // 30 secondi "ufficiali" per il gioco
    const toleranceMs = 5000; // 5 secondi di tolleranza per ritardi invio/rete

    const roundDoc = await Round.create({
      roundNumber: state.roundCounter++,
      adminText: text,
      startTime: now,
      durationMs,
      toleranceMs,
      answers: []
    });

    state.currentRound = {
      dbId: roundDoc._id,
      roundNumber: roundDoc.roundNumber,
      adminText: text,
      startTime: now,
      durationMs,
      toleranceMs
    };

    debugMessages(`Nuovo round avviato: #${roundDoc.roundNumber}`);

    // broadcast round_start a TUTTI
    const msgOut = {
      type: 'round_start',
      roundId: String(roundDoc._id),
      roundNumber: roundDoc.roundNumber,
      text,
      durationMs,
      toleranceMs,
      startTime: now.toISOString()
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

    // Aggiorniamo la lista giocatori sugli admin
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

    // Aggiorniamo la lista giocatori sugli admin
    broadcastPlayerListToAdmins();
  }

  async function handlePlayerAnswer(ws, client, msg) {
    if (!state.currentRound) {
      // round non attivo
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

    // Controllo finestra di accettazione (30s + 5s di tolleranza)
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
    const late = diffMs > durationMs; // dentro la tolleranza ma oltre i 30s ufficiali

    // Verifichiamo che non esista già una risposta per questo playerName nel round
    const existing = await Round.findOne({
      _id: state.currentRound.dbId,
      'answers.playerName': playerName
    }).lean();

    if (existing) {
      // già risposto, ignoriamo (ma logghiamo)
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

    // Nuova answer, con stato immagine "pending"
    const answer = {
      playerName,
      playerId,
      text,
      submittedAt: now,
      submittedByTimeout,
      late,
      imagePath: null,
      imageStatus: 'pending',
      imageError: null
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
      imageStatus: 'pending'
    };

    // broadcast ad ADMIN + TUTTI I PLAYER (così i giocatori vedono prompt/risposte del round)
    broadcast(
      (c) => c.role === 'admin' || c.role === 'player',
      msgOut
    );

    // eco al giocatore (per conferma "ok" lato client)
    sendTo(ws, {
      type: 'answer_accepted',
      roundId: String(state.currentRound.dbId),
      submittedAt: now.toISOString(),
      late
    });

    // Avvio asincrono della generazione immagine
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
