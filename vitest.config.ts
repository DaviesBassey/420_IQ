import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    // Default environment is 'node'; component tests opt into jsdom via a
    // `/** @vitest-environment jsdom */` doc comment (environmentMatchGlobs
    // is not supported by the installed Vitest version's InlineConfig type).
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
