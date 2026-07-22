import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRepos, type Repos } from '@/data/repos';

let repos: Repos | null = null;

export function getRepos(): Repos {
  if (!repos) {
    const dbPath = process.env.DB_PATH ?? 'data/420iq.sqlite';
    mkdirSync(dirname(dbPath), { recursive: true });
    repos = createRepos(dbPath);
  }
  return repos;
}
