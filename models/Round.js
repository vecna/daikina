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

    // Riferimento al torneo e nome denormalizzato
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament'
    },
    tournamentName: String,

    // Modello Replicate effettivamente usato per questa risposta
    modelName: String,

    // Campi immagine
    imagePath: String,
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

    // Riferimento al torneo e nome denormalizzato
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament'
    },
    tournamentName: String,

    // Modello “di default” del round (può differire da answer.modelName se
    // il modello viene cambiato a metà round)
    modelName: String,

    answers: [AnswerSchema],

    // Vincitori per nome
    winnerNames: [String]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Round', RoundSchema);
