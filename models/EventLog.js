// models/EventLog.js
const mongoose = require('mongoose');

const EventLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  type: String,         // es. "round_start", "player_answer", ...
  direction: String,    // "client->server" o "server->client"
  role: String,         // "admin", "player", ...
  playerName: String,   // se applicabile
  connectionId: String, // id della connessione WS
  payload: mongoose.Schema.Types.Mixed
});

EventLogSchema.index({ timestamp: -1 });
EventLogSchema.index({ type: 1 });
EventLogSchema.index({ playerName: 1 });

module.exports = mongoose.model('EventLog', EventLogSchema);

