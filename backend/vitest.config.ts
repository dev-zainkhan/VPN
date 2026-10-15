import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // core/config.ts validates the environment at import; tests use fixed dummy values.
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://veil:veil_dev_password@localhost:5432/veil?schema=public',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
      TOKEN_PEPPER: 'test-token-pepper-test-token-pepper-0000',
      ABUSE_PEPPER: 'test-abuse-pepper-test-abuse-pepper-0000',
      ADMOB_AD_UNIT_ID: 'ca-app-pub-0000000000000000/0000000000',
      JOBS_ENABLED: 'false',
      LOG_LEVEL: 'fatal',
    },
  },
});
