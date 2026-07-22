import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRepos } from '../src/data/repos';
import { seedDatabase } from '../src/data/seedData';

async function main() {
  const dbPath = process.env.DB_PATH ?? 'data/420iq.sqlite';
  mkdirSync(dirname(dbPath), { recursive: true });

  const repos = createRepos(dbPath);
  const { imported, demo } = await seedDatabase(repos);

  console.log(`Seed complete: ${imported} prototype question(s) imported, ${demo} demo question(s) added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
