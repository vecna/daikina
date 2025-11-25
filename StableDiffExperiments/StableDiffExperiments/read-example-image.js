const fs = require('fs');

const prompt = 'What’s in this picture?';

// If you want to include an image (optional)
const imageBase64 = fs.readFileSync('./example.jpg', { encoding: 'base64' });

fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llava:latest',
    prompt: prompt,
    images: [imageBase64], // optional — omit if not using image
    stream: false
  }),
})
  .then(res => res.json())
  .then(data => {
    console.log('Generated Output:\n', data.response);
  })
  .catch(err => console.error('Error:', err));

