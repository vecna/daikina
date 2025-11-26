// models/Score.js
const mongoose = require('mongoose');

const ScoreSchema = new mongoose.Schema(
  {
    // Torneo a cui appartiene questo punteggio.
    // Lasciato opzionale per compatibilità con dati esistenti.
    tournamentName: {
      type: String,
      default: null
    },

    // Nome del giocatore (nickname)
    playerName: {
      type: String,
      required: true,
      trim: true
    },

    // Punteggio accumulato in questo torneo
    score: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Un punteggio per coppia (tournamentName, playerName)
// tournamentName può essere null per i dati "storici" / pre-tournament
ScoreSchema.index(
  { tournamentName: 1, playerName: 1 },
  { unique: true }
);

module.exports = mongoose.model('Score', ScoreSchema);

