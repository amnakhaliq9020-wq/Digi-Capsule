import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_URL, startPostgres } from './postgres.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps', 'api');

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
      shell: true,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

const server = await startPostgres();
await run('npx', ['prisma', 'generate'], { cwd: apiDir, env: { DATABASE_URL: DEV_URL } });
await run('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env: { DATABASE_URL: DEV_URL } });

const children = [
  spawn('npm', ['run', 'start:dev', '-w', 'api'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: DEV_URL },
    stdio: 'inherit',
    shell: true,
  }),
  spawn('npm', ['run', 'dev', '-w', 'web'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }),
];

console.log('Digi Capsule web: http://127.0.0.1:3000');
console.log('Digi Capsule API: http://127.0.0.1:3001');

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  if (server.started) await server.stop();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
