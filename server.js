// server.js
require('dotenv').config?.();

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
const Tournament = require('./models/Tournament');
const Settings = require('./models/Settings');

const { createUtils } = require('./utils');
const { createMessageHandlers } = require('./messages');
const { registerApiRoutes } = require('./api');
const { createImageService } = require('./imageService');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/realtime-text-game';

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// Stato condiviso
const state = {
  clients: new Map(),
  currentRound: null,
  nextClientId: 1,
  nextPlayerNumber: 1,
  roundCounter: 1,

  // Nuovo: torneo e modello correnti
  currentTournamentName: null,
  currentTournamentId: null,
  currentModelName: null
};

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    debugAPP('MongoDB connesso');
    await initGlobalSettingsAndTournament();
  })
  .catch((err) => {
    debugAPP('Errore connessione MongoDB:', err);
  });

const utils = createUtils({
  state,
  WebSocket,
  EventLog
});

const imageService = createImageService({
  state,
  Round,
  utils
});

registerApiRoutes({
  app,
  Round,
  Score,
  EventLog,
  Tournament,
  Settings,
  state,
  utils
});

const wss = new WebSocket.Server({ server, path: '/ws' });

const messageHandlers = createMessageHandlers({
  state,
  Round,
  Tournament,
  utils,
  imageService
});

wss.on('connection', (ws) => {
  const id = 'c' + state.nextClientId++;
  state.clients.set(ws, { id, role: null, playerName: null });

  debugWS(`Nuova connessione: ${id}`);

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

// Inizializza torneo e modello correnti da Settings + Tournament
async function initGlobalSettingsAndTournament() {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      // Se non esiste nulla, creiamo un torneo di default
      let defaultTournament = await Tournament.findOne({
        name: 'Default Tournament'
      });
      if (!defaultTournament) {
        defaultTournament = await Tournament.create({
          name: 'Default Tournament',
          isClosed: false
        });
      }

      settings = await Settings.create({
        currentTournamentName: defaultTournament.name,
        currentModelName: process.env.REPLICATE_MODEL || null
      });
    }

    state.currentTournamentName = settings.currentTournamentName || null;
    state.currentModelName = settings.currentModelName || null;

    if (state.currentTournamentName) {
      let t = await Tournament.findOne({
        name: state.currentTournamentName
      });
      if (!t) {
        t = await Tournament.create({
          name: state.currentTournamentName,
          isClosed: false
        });
      }
      state.currentTournamentId = t._id;
    }

    debugAPP(
      'Settings inizializzate: torneo=%s, modello=%s',
      state.currentTournamentName,
      state.currentModelName
    );
  } catch (err) {
    debugAPP('Errore init settings/tournament:', err);
  }
}

// Dump CLI
function dumpConnections() {
  console.log('--- DUMP CONNESSIONI ATTIVE ---');
  console.log(`Totale connessioni: ${state.clients.size}`);
  console.log(
    `Torneo corrente: ${state.currentTournamentName || '-'} (id=${
      state.currentTournamentId || '-'
    })`
  );
  console.log(`Modello corrente: ${state.currentModelName || '-'}`);

  let index = 0;
  for (const [ws, info] of state.clients.entries()) {
    const socket = ws._socket;
    const remoteAddress = socket && socket.remoteAddress;
    const remotePort = socket && socket.remotePort;

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

// Comandi CLI
if (process.stdin.isTTY) {
  debugAPP(
    'Abilito comandi CLI: premi "d" per dump connessioni, Ctrl+C per uscire.'
  );

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('data', (chunk) => {
    const key = String(chunk);

    if (key === 'd' || key === 'D') {
      dumpConnections();
    }

    if (key === '\u0003') {
      console.log('\nChiusura server richiesta da CLI (Ctrl+C).');
      process.exit(0);
    }
  });
} else {
  debugAPP('STDIN non è TTY: comandi CLI disabilitati.');
}

server.listen(PORT, () => {
  debugAPP(`Server in ascolto su http://localhost:${PORT}`);
});
