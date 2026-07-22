import { rmSync } from 'node:fs';

// Runs once before the whole E2E suite. The webServer (see playwright.config.ts)
// points DB_PATH at a dedicated e2e database so runs never touch the
// developer's working `data/420iq.sqlite`; deleting it here guarantees every
// suite run starts from an empty database regardless of what a previous run
// (or a crashed run) left behind. `force: true` makes this a no-op instead of
// throwing when the file doesn't exist yet (fresh checkout / first run).
export default function globalSetup(): void {
  rmSync('data/e2e.sqlite', { force: true });
  rmSync('data/e2e.sqlite-journal', { force: true });
  rmSync('data/e2e.sqlite-wal', { force: true });
  rmSync('data/e2e.sqlite-shm', { force: true });
}
