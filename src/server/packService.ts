import type { Repos } from '@/data/repos';
import { generateLanes } from '@/domain/laneGenerator';
import { generateSeed } from '@/domain/rng';
import type { LaneQuestion, FairnessReport } from '@/domain/fairness';
import { FORMAT_V1 } from '@/domain/formatConfig';

export async function generatePack(repos: Repos, opts: {
  episodeId: string; laneCount: number; questionsPerLane: number; seed?: string;
}): Promise<{ packId: string; seed: string; report: FairnessReport; lanes: string[][] }> {
  const nowIso = new Date().toISOString();
  const pool = await repos.questions.eligibleForPack(nowIso);
  const candidates: LaneQuestion[] = pool.map((q) => ({
    id: q.questionId,
    domain: q.domain,
    difficulty: q.difficulty,
    readTimeSec: q.readTimeSec,
    sensitivityTier: q.sensitivityTier,
    factKey: q.factKey,
  }));

  const seed = opts.seed ?? generateSeed();
  const generated = generateLanes(
    candidates,
    { seed, laneCount: opts.laneCount, questionsPerLane: opts.questionsPerLane },
    FORMAT_V1,
  );

  const lanes = generated.lanes.map((lane) => lane.map((q) => q.id));
  const packId = await repos.packs.create({
    episodeId: opts.episodeId,
    seed,
    lanes,
    reportJson: JSON.stringify(generated.report),
  });

  await repos.audit.log({
    actor: 'system',
    action: 'pack.generate',
    detail: JSON.stringify({ packId, episodeId: opts.episodeId, seed, balanceScore: generated.report.balanceScore }),
  });

  return { packId, seed, report: generated.report, lanes };
}

export async function approvePack(repos: Repos, packId: string, approver: string): Promise<{ checksum: string }> {
  const result = await repos.packs.approve(packId, approver);

  await repos.audit.log({
    actor: approver,
    action: 'pack.approve',
    detail: JSON.stringify({ packId, checksum: result.checksum }),
  });

  return result;
}
