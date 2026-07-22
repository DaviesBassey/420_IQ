export type Domain =
  | 'SCIENCE' | 'HISTORY' | 'AFRICA_INDIGENOUS' | 'LAW_POLICY'
  | 'HEALTH_SAFETY' | 'CULTURE_MEDIA' | 'BUSINESS_ETHICS' | 'FUTURE_INNOVATION';
export type Difficulty = 'SPARK' | 'FLAME' | 'INFERNO' | 'WILD_420';
export type Confidence = 'CURIOUS' | 'CONFIDENT' | 'CERTAIN';
export type RiskBand = 'HOLD' | 'RISE' | 'REACH';
export type SensitivityTier = 1 | 2 | 3;
export type QuestionStatus =
  | 'DRAFT' | 'EDITORIAL_REVIEW' | 'COUNCIL_REVIEW' | 'APPROVED'
  | 'LOCKED' | 'USED' | 'RETIRED' | 'EXPIRED';
export type SessionMode = 'rehearsal' | 'live';
export type LifelineType = 'TRUSTED_CIRCLE' | 'SOURCE_SIGNAL';

export interface QuestionVersionData {
  questionId: string;
  version: number;
  domain: Domain;
  difficulty: Difficulty;
  stem: string;
  choices: string[];          // 4–5 entries
  correctIndex: number;       // PRIVILEGED — never serialized publicly
  explanation: string;
  knowledgeDrop: string | null;
  sourceTitle: string;
  sourceUrl: string;
  correctAsOf: string;        // ISO date
  jurisdiction: string | null;
  sensitivityTier: SensitivityTier;
  expiresAt: string | null;   // ISO date; required for tier 3
  readTimeSec: number;
  factKey: string;            // dedupe key, e.g. slug of core fact
  demoFlag: string | null;    // e.g. 'general-trivia', 'demo-seed'
}
