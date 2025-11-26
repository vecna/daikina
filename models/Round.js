// models/Round.js
const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema(
  {
    playerName: String,
    playerId: String,
    text: String,
    submittedAt: Date,
    submittedByTimeout: Boolean,
    late: Boolean,
    // Nuovi campi per gestione immagine
    imagePath: String, // es. "/pictures/<roundId>-<playerId>.png"
    imageStatus: {
      type: String,
      enum: ['pending', 'ok', 'error'],
      default: 'pending'
    },
    imageError: String
  },
  { _id: false }
);

const RoundSchema = new mongoose.Schema(
  {
    roundNumber: Number,
    adminText: String,
    startTime: Date,
    durationMs: Number,
    toleranceMs: Number,
    answers: [AnswerSchema],
    // (già previsto in una versione precedente)
    winnerNames: [String]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Round', RoundSchema);

