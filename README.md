# daikina

daikon + NINA experiments on PROMPT BATTLE


## Sampler Name

The `sampler_name` option determines which algorithm is used to generate images in Stable Diffusion.

### Default Sampler
- The default sampler is `DPM++ 2M Karras`.
- This default is set in `config.json`, `.env`, or via command line options (with highest precedence).
- If not specified, the script uses the value from `config.json` or `.env`.

### Available Sampler Options
You can use any of the following sampler names:

- `Euler a`
- `DPM++ 2M Karras` (default)
- `DPM++ SDE Karras`
- `DDIM`
- `Heun`

You can find more sampler options in the Stable Diffusion WebUI under Settings → Sampler.

Specify the sampler with:
```
node local-stablediff.js --sampler_name "Euler a" --prompt "your prompt"
```

## local-stablediff.js

Daikina Stable Diffusion CLI, very early version for experiment only.
This script sends a prompt and options to a local Stable Diffusion WebUI API to generate images.

### Usage

```
node local-stablediff.js --prompt "A description of your image" [options]
```

#### Mandatory:
- `--prompt`, `-p` : Your main description of the image

#### Optional:
- `--negative_prompt`, `-n` : Words to avoid (e.g., "blurry", "bad anatomy")
- `--steps`, `-s` : Number of steps (20–50 usually good)
- `--cfg_scale`, `-c` : How strongly the prompt is followed (7–12 is good)
- `--sampler_name`, `-S` : Which sampler to use
- `--width`, `-W` : Image width
- `--height`, `-H` : Image height
- `--seed`, `-d` : Seed for reproducibility
- `--batch_size`, `-b` : Images per batch
- `--n_iter`, `-i` : Number of batches
- `--restore_faces`, `-r` : Fix distorted faces
- `--tiling`, `-t` : Enable seamless textures
- `--output`, `-o` : Output seed pattern for filenames
- `--config` : Path to config.json
- `--help` : Show all options and descriptions
- `--version` : Show script version

Options can also be set via `config.json` and `.env` file. Command line options take precedence.

---

## looper.js

This script executes `local-stablediff.js` 100 times, changing the `--seed` value from 1 to 100 for each run.

### Usage

```
node looper.js --prompt "your prompt" --output "outputSeed"
```

#### Arguments:
- `--prompt`, `-p` : The prompt for image generation (required)
- `--output`, `-o` : Output seed pattern (required)

Each run will generate an image and log with a different seed value.

---

### Requirements

- Node.js installed
- Stable Diffusion WebUI running locally with API enabled
- Install dependencies:

```
npm install 
```

---

For more details, see comments in each script.
