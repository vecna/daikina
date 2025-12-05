const Replicate = require('replicate');
require('dotenv').config();

const replicateToken = process.env.REPLICATE_API_TOKEN;

async function main() {
  if (!replicateToken) {
    console.error('REPLICATE_API_TOKEN non impostato.');
    return;
  }

  const replicate = new Replicate({ auth: replicateToken });
  const result = await replicate.models.list();

  // save the result into models.json
  const fs = require('fs');
  fs.writeFileSync('models.json', JSON.stringify(result, null, 2));
  console.log('Modelli salvati in models.json');
}

main();;