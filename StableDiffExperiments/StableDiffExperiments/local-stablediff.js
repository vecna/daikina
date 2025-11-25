/**
 * local-stablediff.js
 *
 * This script sends a prompt and options to a local Stable Diffusion WebUI API to generate images.
 *
 * Usage:
 *   node local-stablediff.js --prompt "A description of your image" [options]
 *
 * Mandatory:
 *   --prompt, -p        Your main description of the image
 *
 * Optional:
 *   --negative_prompt, -n   Words to avoid (e.g., "blurry", "bad anatomy")
 *   --steps, -s             Number of steps (20–50 usually good)
 *   --cfg_scale, -c         How strongly the prompt is followed (7–12 is good)
 *   --sampler_name, -S      Which sampler to use
 *   --width, -W             Image width
 *   --height, -H            Image height
 *   --seed, -d              Seed for reproducibility
 *   --batch_size, -b        Images per batch
 *   --n_iter, -i            Number of batches
 *   --restore_faces, -r     Fix distorted faces
 *   --tiling, -t            Enable seamless textures
 *   --output, -o            Output seed pattern for filenames
 *   --config                Path to config.json
 *   --help                  Show all options and descriptions
 *
 * Options can also be set via config.json and .env file. Command line options take precedence.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');


// Option descriptions from REMINDER.md
const optionDescriptions = {
  prompt: 'Your main description of the image',
  negative_prompt: 'Words to avoid (e.g., "blurry", "bad anatomy")',
  steps: 'More steps = better detail (20–50 usually good)',
  cfg_scale: 'How strongly the prompt is followed (7–12 is good)',
  sampler_name: 'Which sampler to use (see list below)',
  width: 'Dimensions of the image (max usually 1024×1024)',
  height: 'Dimensions of the image (max usually 1024×1024)',
  seed: 'Use -1 for random, or fix it for reproducible results',
  batch_size: 'Images generated per batch',
  n_iter: 'How many batches to generate',
  restore_faces: 'Fix distorted faces (good for portraits)',
  tiling: 'Enable if you want seamless textures'
};

// Yargs options mapping

const yargsOptions = {
  prompt: { alias: 'p', type: 'string', describe: optionDescriptions.prompt, demandOption: true },
  negative_prompt: { alias: 'n', type: 'string', describe: optionDescriptions.negative_prompt },
  steps: { alias: 's', type: 'number', describe: optionDescriptions.steps },
  cfg_scale: { alias: 'c', type: 'number', describe: optionDescriptions.cfg_scale },
  sampler_name: { alias: 'S', type: 'string', describe: optionDescriptions.sampler_name },
  width: { alias: 'W', type: 'number', describe: optionDescriptions.width },
  height: { alias: 'H', type: 'number', describe: optionDescriptions.height },
  seed: { alias: 'd', type: 'number', describe: optionDescriptions.seed },
  batch_size: { alias: 'b', type: 'number', describe: optionDescriptions.batch_size },
  n_iter: { alias: 'i', type: 'number', describe: optionDescriptions.n_iter },
  restore_faces: { alias: 'r', type: 'boolean', describe: optionDescriptions.restore_faces },
  tiling: { alias: 't', type: 'boolean', describe: optionDescriptions.tiling },
  config: { type: 'string', describe: 'Path to config.json' },
  output: { alias: 'o', type: 'string', describe: 'Output seed pattern' }
};

const argv = yargs(hideBin(process.argv))
  .options(yargsOptions)
  .help('help')
  .usage('Usage: $0 --prompt "desc" [options]')
  .epilog('Mandatory: --prompt/-p\nOptional: all other options. See descriptions above.')
  .argv;


// Load .env if exists
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (e) {}

// Load config.json if exists or from --config
let configFile = argv.config ? path.resolve(argv.config) : path.join(__dirname, 'config.json');
let configJson = {};
if (fs.existsSync(configFile)) {
  try {
    configJson = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (e) {
    console.error('Error reading config.json:', e.message);
  }
}

// Build config from env, config.json, and command line
function getConfig(argv) {
  // Start with config.json
  let config = { ...configJson };
  // Override with .env
  for (const key in process.env) {
    if (config.hasOwnProperty(key.toLowerCase())) {
      config[key.toLowerCase()] = process.env[key];
    }
  }
  // Override with command line options (yargs)
  for (const key in argv) {
    if (key !== '_' && key !== '$0' && argv[key] !== undefined) {
      config[key] = argv[key];
    }
  }
  // Prompt as first arg if not set
  if (!config.prompt && argv._.length > 0) {
    config.prompt = argv._[0];
  }
  return config;
}

async function buildOutput(args) {
  // Ensure output folder exists
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Use yargs output option
  let seed = argv.output || 'output';

  // Build timestamp
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const YY = now.getFullYear().toString().slice(-2);
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const baseName = `${seed}-${YY}${MM}${DD}-${HH}${mm}`;

  return {
    outputDir,
    jpg: path.join(outputDir, `${baseName}.jpg`),
    json: path.join(outputDir, `${baseName}.json`),
    baseName,
    seed
  };
}

// Check for mandatory prompt
if (!argv.prompt) {
  console.error('❌ Error: --prompt is required. Use --help for usage info.');
  process.exit(1);
}

const config = getConfig(argv);

// Get current model from API
async function getCurrentModel() {
  try {
    const response = await fetch('http://localhost:7860/sdapi/v1/options');
    const data = await response.json();
    return data.sd_model_checkpoint || null;
  } catch (err) {
    console.error('❌ Error fetching current model:', err.message);
    return null;
  }
}

async function generateImage(config) {
  try {
    const response = await fetch('http://localhost:7860/sdapi/v1/txt2img', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await response.json();
    if (!data.images || data.images.length === 0) {
      throw new Error('No image returned by Stable Diffusion.');
    }
    return data;
  } catch (err) {
    console.error('❌ Error generating image:', err.message);
    console.log('Did you remember to start the Stable Diffusion server?');
    return null;
  }
}

async function saveLogs(config, data, model) {
  if (!data || !data.images || data.images.length === 0) return;
  const base64Image = data.images[0];
  const buffer = Buffer.from(base64Image, 'base64');
  // Build output filenames
  const outputStruct = await buildOutput(process.argv);
  // Save image
  fs.writeFileSync(outputStruct.jpg, buffer);
  console.log(`✅ Image saved to ${outputStruct.jpg}`);
  // Prepare JSON log
  const dataNoImages = { ...data };
  delete dataNoImages.images;
  if (dataNoImages.info) {
    try {
      dataNoImages.info = JSON.parse(dataNoImages.info);
    } catch (e) {}
  }
  const jsonToSave = {
    request: config,
    data: dataNoImages,
    model: model
  };
  fs.writeFileSync(outputStruct.json, JSON.stringify(jsonToSave, null, 2));
  console.log(`✅ JSON saved to ${outputStruct.json}`);
}

(async () => {
  const model = await getCurrentModel();
  const data = await generateImage(config);
  await saveLogs(config, data, model);
})();