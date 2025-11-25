// models/Score.js
const mongoose = require('mongoose');

const ScoreSchema = new mongoose.Schema(
  {
    playerName: { type: String, unique: true },
    score: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Score', ScoreSchema);

