import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_URL, TEST_URL, startPostgres } from './postgres.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps', 'api');
const webDir = path.join(root, 'apps', 'web');

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

async function migrate(databaseUrl) {
  await run('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { DATABASE_URL: databaseUrl },
  });
}

const server = await startPostgres();

try {
  await run('npx', ['prisma', 'generate'], { cwd: apiDir, env: { DATABASE_URL: DEV_URL } });
  await migrate(DEV_URL);
  await migrate(TEST_URL);
  await run('npm', ['run', 'test:e2e', '-w', 'api'], {
    env: {
      DATABASE_URL: TEST_URL,
      JWT_SECRET: 'test-jwt-secret-digi-capsule',
      NODE_ENV: 'test',
    },
  });
  await run('npx', ['playwright', 'install', 'chromium'], { cwd: webDir });
  await run('npx', ['playwright', 'test'], { cwd: webDir });
} finally {
  if (server.started) {
    await server.stop();
  }
}
