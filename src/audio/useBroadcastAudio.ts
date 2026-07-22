'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from './AudioEngine';
import { selectCues } from './transitions';
import type { ProjectedSnapshot } from '@/server/projection';

export interface UseBroadcastAudioResult {
  engine: AudioEngine;
  armed: boolean;
  muted: boolean;
  arm: () => Promise<void>;
  toggleMute: () => void;
}

/**
 * Owns a single AudioEngine for the lifetime of the mounted component and
 * translates snapshot transitions into cue playback. The AudioEngine itself
 * is safe to construct at any time (it never touches AudioContext until
 * `arm()`), so lazily creating it on the ref during render is safe even
 * under React StrictMode's double render pass -- the guard below means only
 * one instance ever survives per mount.
 *
 * The cleanup effect disposes the engine on unmount. Under StrictMode's
 * dev-only mount -> cleanup -> mount simulation, this means dispose() runs
 * against the same engine instance that keeps living -- AudioEngine.dispose()
 * is written so a later arm() rebuilds its graph cleanly against a fresh
 * AudioContext in that case.
 */
export function useBroadcastAudio(snapshot: ProjectedSnapshot | null): UseBroadcastAudioResult {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine();
  }
  const engine = engineRef.current;

  const [armed, setArmed] = useState(engine.armed);
  const [muted, setMuted] = useState(engine.muted);

  const prevSnapshotRef = useRef<ProjectedSnapshot | null>(null);

  useEffect(() => {
    return () => {
      engine.dispose();
    };
  }, [engine]);

  useEffect(() => {
    if (!snapshot) return;
    const cues = selectCues(prevSnapshotRef.current, snapshot);
    for (const cue of cues) {
      engine.play(cue);
    }
    prevSnapshotRef.current = snapshot;
  }, [engine, snapshot]);

  const arm = async () => {
    await engine.arm();
    setArmed(engine.armed);
  };

  const toggleMute = () => {
    engine.setMuted(!engine.muted);
    setMuted(engine.muted);
  };

  return { engine, armed, muted, arm, toggleMute };
}
