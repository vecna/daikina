// imageService.js
// Gestisce la generazione asincrona di immagini via Replicate e l'aggiornamento del DB.

const path = require('path');
const fs = require('fs');
const { writeFile } = require('fs/promises');
const debugImage = require('debug')('server:image');
const Replicate = require('replicate');

/**
 * Crea il servizio di generazione immagini.
 * @param {Object} deps
 * @param {Object} deps.state - stato condiviso del server
 * @param {Object} deps.Round - modello Mongoose Round
 * @param {Object} deps.utils - { logEvent, sendTo, broadcast, broadcastPlayerListToAdmins }
 */
function createImageService({ state, Round, utils }) {
  const { broadcast, logEvent } = utils;

  // Cartella dove salviamo le immagini statiche
  const picturesDir = path.join(__dirname, 'public', 'pictures');
  fs.mkdirSync(picturesDir, { recursive: true });

  // Inizializza client Replicate solo se c'è la chiave
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const replicateModel =
    process.env.REPLICATE_MODEL || 'black-forest-labs/flux-schnell';

  let replicate = null;

  if (replicateToken) {
    replicate = new Replicate({
      auth: replicateToken
    });
    debugImage('Replicate client inizializzato, model=%s', replicateModel);
  } else {
    debugImage(
      'ATTENZIONE: REPLICATE_API_TOKEN non impostato. Generazione immagini DISABILITATA.'
    );
  }

  /**
   * Avvia in background la generazione immagine per una risposta.
   * Non blocca il flusso di gioco (fire-and-forget).
   */
  function queueImageGeneration({ roundId, roundNumber, playerId, playerName, prompt }) {
    if (!replicate) {
      debugImage('skip image generation: replicate non inizializzato');
      return;
    }

    // Piccolo worker asincrono
    (async () => {
      const startedAt = new Date();
      debugImage(
        'Avvio generazione immagine: round=%s, player=%s (%s)',
        roundId,
        playerId,
        playerName
      );

      try {
        // 1. Chiamata al modello su Replicate
        const result = await replicate.run(replicateModel, {
          input: {
            prompt
          }
        });

        if (!Array.isArray(result) || result.length === 0) {
          throw new Error('Risultato vuoto da Replicate');
        }

        const imageContent = result[0];

        // 2. Salvataggio su disco
        const safeRoundId = String(roundId);
        const safePlayerId = String(playerId).replace(/[^\w-]+/g, '_');
        const fileName = `${safeRoundId}-${safePlayerId}.png`;
        const filePath = path.join(picturesDir, fileName);
        const publicPath = `/pictures/${fileName}`;

        await writeFile(filePath, imageContent);
        debugImage('Immagine salvata: %s', filePath);

        // 3. Aggiorno il documento Round: risposta di questo player
        await Round.updateOne(
          {
            _id: roundId,
            'answers.playerId': playerId,
            'answers.playerName': playerName
          },
          {
            $set: {
              'answers.$.imagePath': publicPath,
              'answers.$.imageStatus': 'ok',
              'answers.$.imageError': null
            }
          }
        );

        // 4. Loggo l'evento
        await logEvent({
          type: 'image_generated',
          direction: 'server->client',
          role: 'system',
          playerName,
          connectionId: 'image-service',
          payload: {
            roundId,
            roundNumber,
            playerId,
            playerName,
            imagePath: publicPath,
            startedAt,
            finishedAt: new Date()
          }
        });

        // 5. Notifico admin e player via WS
        const msgOut = {
          type: 'answer_image_ready',
          roundId: String(roundId),
          roundNumber,
          playerId,
          playerName,
          imagePath: publicPath
        };

        // Tutti gli admin
        broadcast((c) => c.role === 'admin', msgOut);
        // Il giocatore specifico
        broadcast((c) => c.id === playerId, msgOut);
      } catch (err) {
        debugImage('Errore generazione immagine:', err);

        // Aggiorno lo stato della risposta come errore
        try {
          await Round.updateOne(
            {
              _id: roundId,
              'answers.playerId': playerId,
              'answers.playerName': playerName
            },
            {
              $set: {
                'answers.$.imageStatus': 'error',
                'answers.$.imageError': err.message || String(err)
              }
            }
          );
        } catch (dbErr) {
          debugImage('Errore aggiornamento stato immagine nel DB:', dbErr);
        }

        // Log dell'errore
        await logEvent({
          type: 'image_generation_error',
          direction: 'server->client',
          role: 'system',
          playerName,
          connectionId: 'image-service',
          payload: {
            roundId,
            roundNumber,
            playerId,
            playerName,
            error: err.message || String(err)
          }
        });
      }
    })().catch((err) => {
      // catch di fallback per errori nella IIFE
      debugImage('Errore non gestito nel worker di imageService:', err);
    });
  }

  return {
    queueImageGeneration
  };
}

module.exports = {
  createImageService
};

