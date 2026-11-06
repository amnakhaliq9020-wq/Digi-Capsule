import { defineConfig } from "vitest/config";

const databaseUrl = process.env.TEST_DATABASE_URL || "postgresql://digi:digi@localhost:5432/digi_capsule_test";
const encryptionKey = Buffer.alloc(32, 7).toString("base64");

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    globalSetup: "./src/test/global-setup.ts",
    include: ["src/test/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      DATA_ENCRYPTION_KEY: encryptionKey,
      DIGI_TEST_MODE: "true",
      VERIFICATION_RELEASES_ENABLED: "false",
      WEB_ORIGIN: "http://localhost:3000",
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_DIR: "./var/test-storage",
      API_PORT: "3001",
    },
  },
});
