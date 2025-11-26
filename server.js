// server.js - entrypoint principale

require('dotenv').config?.(); // opzionale se usi un file .env

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const debugWS = require('debug')('server:ws');
const debugAPP = require('debug')('server:app');

const Round = require('./models/Round');
const EventLog = require('./models/EventLog');
const Score = require('./models/Score');

const { createUtils } = require('./utils');
const { createMessageHandlers } = require('./messages');
const { registerApiRoutes } = require('./api');

// --- Configurazione base Express / HTTP ---

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/realtime-text-game';

// Middleware base
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// --- Connessione MongoDB ---

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    debugAPP('MongoDB connesso');
  })
  .catch((err) => {
    debugAPP('Errore connessione MongoDB:', err);
  });

// --- Stato condiviso del server ---

const state = {
  clients: new Map(),      // mappa ws -> { id, role, playerName }
  currentRound: null,      // round attualmente in corso
  nextClientId: 1,
  nextPlayerNumber: 1,
  roundCounter: 1
};

// --- Utils condivise (logEvent, sendTo, broadcast, ecc.) ---

const utils = createUtils({
  state,
  WebSocket,
  EventLog
});

// --- API REST (scores, logs, rounds, root) ---

registerApiRoutes({
  app,
  Round,
  Score,
  EventLog,
  utils
});

// --- WebSocket Server ---

const wss = new WebSocket.Server({ server, path: '/ws' });

// Handler dei messaggi WS (definiti in messages.js)
const messageHandlers = createMessageHandlers({
  state,
  Round,
  utils
});

wss.on('connection', (ws) => {
  const id = 'c' + state.nextClientId++;
  state.clients.set(ws, { id, role: null, playerName: null });

  debugWS(`Nuova connessione: ${id}`);

  // Log apertura connessione
  utils.logEvent({
    type: 'connection_open',
    direction: 'client->server',
    role: null,
    playerName: null,
    connectionId: id,
    payload: {}
  });

  ws.on('message', async (data) => {
    try {
      await messageHandlers.onMessage(ws, data);
    } catch (err) {
      debugWS('Errore nella gestione del messaggio WS:', err);
    }
  });

  ws.on('close', () => {
    try {
      messageHandlers.onClose(ws);
    } catch (err) {
      debugWS('Errore nella gestione della chiusura WS:', err);
    }
  });
});

// --- Funzione di dump delle connessioni attive (CLI) ---

function dumpConnections() {
  console.log('--- DUMP CONNESSIONI ATTIVE ---');
  console.log(`Totale connessioni: ${state.clients.size}`);

  let index = 0;
  for (const [ws, info] of state.clients.entries()) {
    const socket = ws._socket;
    const remoteAddress = socket && socket.remoteAddress;
    const remotePort = socket && socket.remotePort;

    // Stato del WebSocket (0..3)
    const readyState = ws.readyState;
    const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    const readyLabel = readyStates[readyState] || String(readyState);

    console.log(
      `#${++index}`,
      {
        id: info.id,
        role: info.role,
        playerName: info.playerName,
        readyState: readyLabel,
        remoteAddress,
        remotePort
      }
    );
  }

  console.log('-------------------------------');
}

// --- Gestione input da CLI (tasto "d" per dump) ---

if (process.stdin.isTTY) {
  debugAPP('Abilito comandi CLI: premi "d" per dump connessioni, Ctrl+C per uscire.');

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('data', (chunk) => {
    const key = String(chunk);

    // 'd' o 'D' -> dump connessioni
    if (key === 'd' || key === 'D') {
      dumpConnections();
    }

    // Ctrl+C (codice ASCII 3) -> lascia passare l'uscita
    if (key === '\u0003') {
      console.log('\nChiusura server richiesta da CLI (Ctrl+C).');
      process.exit(0);
    }
  });
} else {
  debugAPP('STDIN non è TTY: comandi CLI disabilitati.');
}

// --- Avvio server HTTP ---

server.listen(PORT, () => {
  debugAPP(`Server in ascolto su http://localhost:${PORT}`);
});

