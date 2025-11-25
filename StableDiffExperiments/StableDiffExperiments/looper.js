/**
 * looper.js
 *
 * Executes local-stablediff.js 100 times, changing --seed from 0 to 9.
 * Usage: node looper.js --prompt "your prompt" --output "outputSeed"
 */

const { spawn } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
   .option('prompt', {
      alias: 'p',
      type: 'string',
      demandOption: true,
      describe: 'Prompt for image generation'
   })
   .option('output', {
      alias: 'o',
      type: 'string',
      demandOption: true,
      describe: 'Output seed pattern'
   })
   .help()
   .argv;

async function runLoop() {
   for (let seed = 0; seed < 10; seed++) {
      const args = [
         'local-stablediff.js',
         '--prompt', `"${argv.prompt}"`,
         '--output', argv.output,
         '--steps', '40',
         '--sampler_name', "Euler a",
         '--seed', '-1' // seed.toString()
      ];
      console.log(`Running: node ${args.join(' ')}`);
      await new Promise((resolve, reject) => {
         const proc = spawn('node', args, { stdio: 'inherit' });
         proc.on('close', code => {
            if (code !== 0) {
               console.error(`local-stablediff.js exited with code ${code}`);
            }
            resolve();
         });
      });
   }
   console.log('All runs completed.');
}

runLoop();
