const debugUtils = require('debug')('server:utils');

/**
 * Crea le funzioni di utilità condivise.
 * @param {Object} deps
 * @param {Object} deps.state - stato condiviso del server (clients, ecc.)
 * @param {Object} deps.WebSocket - classe WebSocket (ws)
 * @param {Object} deps.EventLog - modello Mongoose EventLog
 */
function createUtils({ state, WebSocket, EventLog }) {
  /**
   * Registra un evento nel database dei log.
   * Viene usata sia per i messaggi client->server che server->client.
   */
  async function logEvent({
    type,
    direction,
    role,
    playerName,
    connectionId,
    payload
  }) {
    try {
      await EventLog.create({
        type,
        direction,
        role,
        playerName,
        connectionId,
        payload,
        timestamp: new Date()
      });
    } catch (err) {
      debugUtils('Errore salvataggio EventLog:', err);
    }
  }

  /**
   * Invia un messaggio JSON ad un singolo client WebSocket.
   */
  function sendTo(ws, msgObj) {
    const client = state.clients.get(ws);
    if (!client || ws.readyState !== WebSocket.OPEN) return;

    const json = JSON.stringify(msgObj);

    try {
      ws.send(json);
      debugUtils(`Inviato messaggio a ${client.id}: ${msgObj.type}`);
    } catch (err) {
      debugUtils('Errore invio WS:', err);
      return;
    }

    // Log server->client (non aspettiamo la Promise)
    logEvent({
      type: msgObj.type || 'server_message',
      direction: 'server->client',
      role: client.role,
      playerName: client.playerName,
      connectionId: client.id,
      payload: msgObj
    });
  }

  /**
   * Invia un messaggio a tutti i client che soddisfano il filtro.
   * Se filterFn è null/undefined, viene inviato a tutti.
   */
  function broadcast(filterFn, msgObj) {
    debugUtils(`Broadcast message: ${msgObj.type}`);

    for (const [ws, info] of state.clients.entries()) {
      if (!filterFn || filterFn(info)) {
        sendTo(ws, msgObj);
      }
    }
  }

  /**
   * Invia agli admin la lista aggiornata dei giocatori connessi.
   */
  function broadcastPlayerListToAdmins() {
    const players = [];
    for (const [ws, info] of state.clients.entries()) {
      if (info.role === 'player') {
        players.push({
          playerId: info.id,
          playerName: info.playerName || 'Senza nome'
        });
      }
    }

    debugUtils(`Broadcast lista giocatori, count=${players.length}`);

    broadcast(
      (c) => c.role === 'admin',
      { type: 'player_list', players }
    );
  }

  return {
    logEvent,
    sendTo,
    broadcast,
    broadcastPlayerListToAdmins
  };
}

module.exports = {
  createUtils
};

