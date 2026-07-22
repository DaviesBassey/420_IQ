'use client';

import { useEffect, useState } from 'react';
import type { ProjectedSnapshot } from '@/server/projection';

export type { ProjectedSnapshot };

export function useGameStream(gameId: string, role: string): ProjectedSnapshot | null {
  const [snapshot, setSnapshot] = useState<ProjectedSnapshot | null>(null);

  useEffect(() => {
    const source = new EventSource(`/api/games/${gameId}/stream?role=${encodeURIComponent(role)}`);
    source.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as ProjectedSnapshot);
    };

    return () => {
      source.close();
      setSnapshot(null);
    };
  }, [gameId, role]);

  return snapshot;
}
