// imageService.js
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

  const picturesDir = path.join(__dirname, 'public', 'pictures');
  fs.mkdirSync(picturesDir, { recursive: true });

  const replicateToken = process.env.REPLICATE_API_TOKEN;

  let replicate = null;

  if (replicateToken) {
    replicate = new Replicate({
      auth: replicateToken
    });
    debugImage('Replicate client inizializzato');
  } else {
    debugImage(
      'ATTENZIONE: REPLICATE_API_TOKEN non impostato. Generazione immagini DISABILITATA.'
    );
  }

  /**
   * Avvia in background la generazione immagine.
   * Usa il modello globale corrente (state.currentModelName).
   */
  function queueImageGeneration({ roundId, roundNumber, playerId, playerName, prompt }) {
    if (!replicate) {
      debugImage('skip image generation: replicate non inizializzato');
      return;
    }

    (async () => {
      const startedAt = new Date();

      const modelToUse =
        state.currentModelName ||
        process.env.REPLICATE_MODEL ||
        'black-forest-labs/flux-1.1-pro';

      debugImage(
        'Avvio generazione immagine: model=%s, round=%s, player=%s (%s)',
        modelToUse,
        roundId,
        playerId,
        playerName
      );

      console.log(`Generazione immagine per round ${roundNumber}, player ${playerName} con prompt: ${prompt}`);
      try {
        const result = await replicate.run(modelToUse, {
          input: { prompt }
        });

        let imageContent = null;
        if (Array.isArray(result)) {
          imageContent = result[0];
        } else if (result && typeof result.getReader === 'function') {
          // Convert ReadableStream to Buffer
          imageContent = await readableStreamToBuffer(result);

        } else {
          console.log('Risultato da Replicate:', result);
          throw new Error('Risultato incompensibile da Replicate');
        }

        // 2. Salvataggio su disco
        const safeRoundId = String(roundId);
        const safePlayerId = String(playerId).replace(/[^\w-]+/g, '_');
        const fileName = `${safeRoundId}-${safePlayerId}.png`;
        const filePath = path.join(picturesDir, fileName);
        const publicPath = `/pictures/${fileName}`;

        await writeFile(filePath, imageContent);
        debugImage('Immagine salvata: %s', filePath);

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
              'answers.$.imageError': null,
              'answers.$.modelName': modelToUse
            }
          }
        );

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
            modelName: modelToUse,
            startedAt,
            finishedAt: new Date()
          }
        });

        const msgOut = {
          type: 'answer_image_ready',
          roundId: String(roundId),
          roundNumber,
          playerId,
          playerName,
          imagePath: publicPath,
          modelName: modelToUse
        };

        // Admin + tutti i player vedono che l'immagine è pronta
        broadcast(
          (c) => c.role === 'admin' || c.role === 'player',
          msgOut
        );
      } catch (err) {
        debugImage('Errore generazione immagine:', err);

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
      debugImage('Errore non gestito nel worker di imageService:', err);
    });
  }

  return {
    queueImageGeneration
  };
}

// Helper: Convert ReadableStream to Buffer
async function readableStreamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let done, value;
  while (true) {
    ({ done, value } = await reader.read());
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

module.exports = {
  createImageService
};
