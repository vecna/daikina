// server.js
require('dotenv').config?.(); // opzionale se usi un file .env

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');

const Round = require('./models/Round');
const EventLog = require('./models/EventLog');
const Score = require('./models/Score');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/realtime-text-game';

// Middleware base
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// --- MongoDB ---
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connesso'))
  .catch((err) => console.error('Errore MongoDB:', err));

// --- Stato in memoria ---
let nextClientId = 1;
let nextPlayerNumber = 1;
let roundCounter = 1;

let currentRound = null; // { dbId, roundNumber, adminText, startTime, durationMs, toleranceMs }

const clients = new Map(); // ws -> { id, role, playerName }

// --- Helper per Log ---
async function logEvent({ type, direction, role, playerName, connectionId, payload }) {
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
    console.error('Errore salvataggio EventLog:', err);
  }
}

// --- Helper WS ---
function sendTo(ws, msgObj) {
  const client = clients.get(ws);
  if (!client || ws.readyState !== WebSocket.OPEN) return;
  const json = JSON.stringify(msgObj);

  try {
    ws.send(json);
  } catch (err) {
    console.error('Errore invio WS:', err);
  }

  // log server->client
  logEvent({
    type: msgObj.type || 'server_message',
    direction: 'server->client',
    role: client.role,
    playerName: client.playerName,
    connectionId: client.id,
    payload: msgObj
  });
}

function broadcast(filterFn, msgObj) {
  for (const [ws, info] of clients.entries()) {
    if (!filterFn || filterFn(info)) {
      sendTo(ws, msgObj);
    }
  }
}

// --- WebSocket Server ---
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const id = 'c' + nextClientId++;
  clients.set(ws, { id, role: null, playerName: null });

  logEvent({
    type: 'connection_open',
    direction: 'client->server',
    role: null,
    playerName: null,
    connectionId: id,
    payload: {}
  });

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.error('Messaggio non JSON:', err);
      return;
    }

    const client = clients.get(ws);
    if (!client) return;

    // Log generico in ingresso
    await logEvent({
      type: msg.type || 'unknown',
      direction: 'client->server',
      role: client.role,
      playerName: client.playerName,
      connectionId: client.id,
      payload: msg
    });

    switch (msg.type) {
      case 'player_register':
        await handlePlayerRegister(ws, client, msg);
        break;

      case 'player_rename':
        await handlePlayerRename(ws, client, msg);
        break;

      case 'player_answer':
        await handlePlayerAnswer(ws, client, msg);
        break;

      case 'admin_round_start':
        await handleAdminRoundStart(ws, client, msg);
        break;

      default:
        console.warn('Tipo messaggio sconosciuto:', msg.type);
        break;
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) {
      logEvent({
        type: 'connection_close',
        direction: 'client->server',
        role: client.role,
        playerName: client.playerName,
        connectionId: client.id,
        payload: {}
      });
    }
    clients.delete(ws);
  });
});

// --- Handler messaggi WS ---

async function handlePlayerRegister(ws, client, msg) {
  client.role = 'player';

  let nameFromClient = (msg.playerName || '').trim();
  if (!nameFromClient) {
    nameFromClient = `Giocatore ${nextPlayerNumber++}`;
  }

  client.playerName = nameFromClient;

  const response = {
    type: 'player_registered',
    playerId: client.id,
    playerName: client.playerName
  };
  sendTo(ws, response);
}

async function handlePlayerRename(ws, client, msg) {
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

  // Potremmo broadcastare il cambio nome a admin, se interessa
  broadcast(
    (c) => c.role === 'admin',
    {
      type: 'player_renamed_broadcast',
      playerId: client.id,
      playerName: client.playerName
    }
  );
}

async function handleAdminRoundStart(ws, client, msg) {
  client.role = 'admin';

  const text = (msg.text || '').trim();
  if (!text) return;

  // Se c'è già un round attivo, per semplicità lo chiudiamo "logicamente"
  currentRound = null;

  const now = new Date();
  const durationMs = 30000; // 30 secondi "ufficiali" per il gioco
  const toleranceMs = 5000; // 5 secondi di tolleranza per ritardi invio/rete

  const roundDoc = await Round.create({
    roundNumber: roundCounter++,
    adminText: text,
    startTime: now,
    durationMs,
    toleranceMs,
    answers: []
  });

  currentRound = {
    dbId: roundDoc._id,
    roundNumber: roundDoc.roundNumber,
    adminText: text,
    startTime: now,
    durationMs,
    toleranceMs
  };

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

async function handlePlayerAnswer(ws, client, msg) {
  if (!currentRound) {
    // round non attivo
    sendTo(ws, { type: 'answer_rejected', reason: 'no_active_round' });
    return;
  }

  if (msg.roundId !== String(currentRound.dbId)) {
    sendTo(ws, { type: 'answer_rejected', reason: 'wrong_round' });
    return;
  }

  const now = new Date();
  const diffMs = now - currentRound.startTime;
  const { durationMs, toleranceMs } = currentRound;

  // Controllo finestra di accettazione
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

  // prima risposta per quel playerName nel round
  const playerName = client.playerName || msg.playerName || 'Senza nome';
  const playerId = client.id;

  const text = (msg.text || '').trim();
  const submittedByTimeout = !!msg.sentByTimeout;
  const late = diffMs > durationMs; // dentro la tolleranza ma oltre i 30s ufficiali

  // Aggiorniamo Mongo solo se non esiste già una risposta per questo playerName nel round
  const existing = await Round.findOne({
    _id: currentRound.dbId,
    'answers.playerName': playerName
  }).lean();

  if (existing) {
    // già risposto, ignoriamo (ma loggiamo)
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
    late
  };

  await Round.updateOne(
    { _id: currentRound.dbId },
    { $push: { answers: answer } }
  );

  // inviamo all'admin (e volendo eco al player)
  const msgOut = {
    type: 'round_answer',
    roundId: String(currentRound.dbId),
    roundNumber: currentRound.roundNumber,
    playerName,
    playerId,
    text,
    submittedAt: now.toISOString(),
    submittedByTimeout,
    late
  };

  // broadcast solo agli admin
  broadcast((c) => c.role === 'admin', msgOut);

  // eco al giocatore
  sendTo(ws, {
    type: 'answer_accepted',
    roundId: String(currentRound.dbId),
    submittedAt: now.toISOString(),
    late
  });
}

// --- API REST: punteggi & log ---

// Punteggi - lista
app.get('/api/scores', async (req, res) => {
  try {
    const scores = await Score.find().sort({ score: -1, playerName: 1 }).lean();
    res.json(scores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore lettura punteggi' });
  }
});

// Punteggi - incrementa (assegna vittoria)
app.post('/api/scores/increment', async (req, res) => {
  const { playerName, roundId } = req.body || {};
  if (!playerName) {
    return res.status(400).json({ error: 'playerName obbligatorio' });
  }

  try {
    const score = await Score.findOneAndUpdate(
      { playerName },
      { $inc: { score: 1 } },
      { upsert: true, new: true }
    );

    // Log dell'evento di punteggio
    await logEvent({
      type: 'score_increment',
      direction: 'client->server',
      role: 'admin',
      playerName,
      connectionId: 'http-api',
      payload: { playerName, roundId }
    });

    // broadcast aggiornamento punteggi
    const msgOut = {
      type: 'score_update',
      playerName,
      score: score.score
    };
    broadcast(null, msgOut);

    res.json(score);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore update punteggio' });
  }
});

// Logs per /log
app.get('/api/logs', async (req, res) => {
  const {
    type,
    playerName,
    sort = 'desc',
    limit = 200,
    skip = 0
  } = req.query;

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
    console.error(err);
    res.status(500).json({ error: 'Errore lettura log' });
  }
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/gioco');
});

server.listen(PORT, () => {
  console.log(`Server in ascolto su http://localhost:${PORT}`);
});

