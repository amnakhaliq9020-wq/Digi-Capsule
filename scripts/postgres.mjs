import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const POSTGRES_PORT = 5433;
export const DEV_URL = `postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/digi_capsule?schema=public`;
export const TEST_URL = `postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/digi_capsule_test?schema=public`;

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function createDatabase(pg, name) {
  try {
    await pg.createDatabase(name);
    console.log(`Created database ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists/i.test(message)) return;
    throw error;
  }
}

export async function startPostgres() {
  if (await canConnect(POSTGRES_PORT)) {
    console.log(`PostgreSQL is already accepting connections on ${POSTGRES_PORT}`);
    return { stop: async () => {}, started: false };
  }

  const pg = new EmbeddedPostgres({
    databaseDir: path.join(root, 'data', 'pg'),
    user: 'postgres',
    password: 'postgres',
    port: POSTGRES_PORT,
    persistent: true,
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onError: (message) => console.error(message),
  });

  try {
    await pg.initialise();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already|not empty/i.test(message)) throw error;
  }

  await pg.start();
  await createDatabase(pg, 'digi_capsule');
  await createDatabase(pg, 'digi_capsule_test');
  console.log(`PostgreSQL ready on ${POSTGRES_PORT}`);
  return {
    started: true,
    stop: async () => {
      await pg.stop();
    },
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const server = await startPostgres();
  console.log('Digi Capsule database is running. Press Ctrl+C to stop.');
  const shutdown = async () => {
    if (server.started) await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
