// models/Tournament.js
const mongoose = require('mongoose');

const TournamentSchema = new mongoose.Schema(
  {
    // Nome del torneo, usato come chiave logica
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    // Se true, il torneo è chiuso e non dovrebbe accettare nuovi round
    isClosed: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true // createdAt, updatedAt
  }
);

module.exports = mongoose.model('Tournament', TournamentSchema);

