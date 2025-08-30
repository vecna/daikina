// generate.js
const fs = require('fs');

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node generate.js "your prompt here" [-o output.jpg]');
  process.exit(1);
}

let prompt = '';
let outputFile = 'output.jpg';

// Extract prompt and optional -o
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' && args[i + 1]) {
    outputFile = args[i + 1];
    i++; // Skip the filename
  } else if (!prompt) {
    prompt = args[i];
  }
}

// Send request to SD WebUI API
fetch('http://localhost:7860/sdapi/v1/txt2img', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: prompt,
    steps: 30,
  }),
})
  .then(res => res.json())
  .then(data => {
    if (!data.images || data.images.length === 0) {
      throw new Error('No image returned by Stable Diffusion.');
    }
    const base64Image = data.images[0];
    const buffer = Buffer.from(base64Image, 'base64');
    fs.writeFileSync(outputFile, buffer);
    console.log(`✅ Image saved to ${outputFile}`);
  })
  .catch(err => {
    console.error('❌ Error generating image:', err.message);
  });

