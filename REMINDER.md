
`stable-diffusion-webui` should run in parallel.

python3 launch.py --precision full --no-half --skip-torch-cuda-test --api



{
  "prompt": "A majestic dragon flying over a misty forest at sunrise, cinematic lighting, 8k, ultra detailed",
  "negative_prompt": "blurry, low quality, cropped, distorted, bad anatomy",
  "steps": 40,
  "cfg_scale": 8.0,
  "sampler_name": "DPM++ 2M Karras",
  "width": 768,
  "height": 768,
  "seed": -1,
  "batch_size": 1,
  "restore_faces": true,
  "tiling": false,
  "n_iter": 1
}


prompt	Your main description of the image
negative_prompt	Words to avoid (e.g., "blurry", "bad anatomy")
steps	More steps = better detail (20–50 usually good)
cfg_scale	How strongly the prompt is followed (7–12 is good)
sampler_name	Which sampler to use (see list below)
width / height	Dimensions of the image (max usually 1024×1024)
seed	Use -1 for random, or fix it for reproducible results
batch_size	Images generated per batch
n_iter	How many batches to generate
restore_faces	Fix distorted faces (good for portraits)
tiling	Enable if you want seamless textures


🧪 Sampler Options

You can list them in WebUI → Settings → Sampler

    "Euler a"

    "DPM++ 2M Karras"

    "DPM++ SDE Karras"

    "DDIM"

    "Heun"


