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

    // Info torneo / modello per questa singola risposta
    tournamentName: String, // torneo a cui appartiene questo answer
    modelName: String,      // modello Replicate effettivamente usato

    // Campi immagine
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

    // Info torneo / modello per questo round
    tournamentName: String, // torneo a cui appartiene il round
    modelName: String,      // modello "di default" usato quando è partito il round

    answers: [AnswerSchema],

    // vincitori (per nome) – può contenere uno o più playerName
    winnerNames: [String]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Round', RoundSchema);

