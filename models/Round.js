// models/Round.js
const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema(
  {
    playerName: String,
    playerId: String,
    text: String,
    submittedAt: Date,
    submittedByTimeout: Boolean,
    late: Boolean
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
    winnerNames: [String]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Round', RoundSchema);

