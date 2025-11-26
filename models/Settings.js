// models/Settings.js
const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema(
  {
    // Nome del torneo attualmente selezionato (se esiste)
    currentTournamentName: {
      type: String,
      default: null
    },

    // Nome del modello Replicate attualmente selezionato
    currentModelName: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true // createdAt, updatedAt
  }
);

module.exports = mongoose.model('Settings', SettingsSchema);

