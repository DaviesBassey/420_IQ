import type { Repos } from './repos';
import type { Domain, Difficulty, QuestionVersionData } from '../domain/types';

// The 16 questions extracted verbatim (stem/choices/correctIndex/explanation)
// from `docs/prototype/premium_quiz.html`'s `defaultQuestions` array
// (between the `QUESTION_DATA_START`/`QUESTION_DATA_END` markers).
type PrototypeSeed = {
  factKey: string;
  stem: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

const PROTOTYPE_SEEDS: PrototypeSeed[] = [
  {
    factKey: 'proto-nigeria-capital',
    stem: 'What is the capital of Nigeria?',
    choices: ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt'],
    correctIndex: 1,
    explanation: "Abuja became Nigeria’s official capital in 1991, replacing Lagos.",
  },
  {
    factKey: 'proto-red-planet',
    stem: 'Which planet is known as the Red Planet?',
    choices: ['Venus', 'Jupiter', 'Mars', 'Mercury', 'Saturn'],
    correctIndex: 2,
    explanation: 'Mars appears red because iron minerals in its soil oxidise, or rust.',
  },
  {
    factKey: 'proto-leap-year-days',
    stem: 'How many days are in a leap year?',
    choices: ['365', '364', '360', '366', '367'],
    correctIndex: 3,
    explanation: 'A leap year contains 366 days because February has an additional day.',
  },
  {
    factKey: 'proto-largest-ocean',
    stem: 'Which ocean is the largest?',
    choices: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'Southern Ocean', 'Pacific Ocean'],
    correctIndex: 4,
    explanation: 'The Pacific Ocean is the largest and deepest ocean on Earth.',
  },
  {
    factKey: 'proto-plants-gas-absorb',
    stem: 'Which gas do plants absorb from the atmosphere?',
    choices: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen', 'Helium'],
    correctIndex: 1,
    explanation: 'Plants absorb carbon dioxide and use it during photosynthesis.',
  },
  {
    factKey: 'proto-12-times-8',
    stem: 'What is 12 multiplied by 8?',
    choices: ['86', '92', '96', '104', '108'],
    correctIndex: 2,
    explanation: 'Twelve multiplied by eight equals ninety-six.',
  },
  {
    factKey: 'proto-largest-land-animal',
    stem: 'Which animal is the largest land animal?',
    choices: ['Giraffe', 'Hippopotamus', 'Rhinoceros', 'African elephant', 'Buffalo'],
    correctIndex: 3,
    explanation: 'The African elephant is the largest living land animal.',
  },
  {
    factKey: 'proto-nigeria-continent',
    stem: 'Which continent is Nigeria located in?',
    choices: ['Asia', 'Europe', 'Africa', 'South America', 'Australia'],
    correctIndex: 2,
    explanation: 'Nigeria is located in West Africa.',
  },
  {
    factKey: 'proto-temperature-instrument',
    stem: 'Which instrument is used to measure temperature?',
    choices: ['Barometer', 'Thermometer', 'Speedometer', 'Altimeter', 'Hygrometer'],
    correctIndex: 1,
    explanation: 'A thermometer measures temperature.',
  },
  {
    factKey: 'proto-pentagon-sides',
    stem: 'How many sides does a pentagon have?',
    choices: ['Three', 'Four', 'Five', 'Six', 'Eight'],
    correctIndex: 2,
    explanation: 'A pentagon is a polygon with five sides.',
  },
  {
    factKey: 'proto-organ-pumps-blood',
    stem: 'Which organ pumps blood around the human body?',
    choices: ['Liver', 'Brain', 'Kidney', 'Heart', 'Lungs'],
    correctIndex: 3,
    explanation: "The heart pumps blood through the body’s circulatory system.",
  },
  {
    factKey: 'proto-blue-yellow-colour',
    stem: 'Which colour is created by mixing blue and yellow?',
    choices: ['Purple', 'Orange', 'Green', 'Brown', 'Red'],
    correctIndex: 2,
    explanation: 'In traditional colour mixing, blue and yellow produce green.',
  },
  {
    factKey: 'proto-first-month',
    stem: 'What is the first month of the year?',
    choices: ['December', 'March', 'February', 'April', 'January'],
    correctIndex: 4,
    explanation: 'January is the first month of the Gregorian calendar.',
  },
  {
    factKey: 'proto-programming-language',
    stem: 'Which of these is a programming language?',
    choices: ['JavaScript', 'Photoshop', 'Chrome', 'Windows', 'YouTube'],
    correctIndex: 0,
    explanation: 'JavaScript is a programming language widely used for web development.',
  },
  {
    factKey: 'proto-minutes-in-hour',
    stem: 'How many minutes are in one hour?',
    choices: ['30', '45', '50', '60', '90'],
    correctIndex: 3,
    explanation: 'One hour contains sixty minutes.',
  },
  {
    factKey: 'proto-device-to-type-text',
    stem: 'Which device is mainly used to type text into a computer?',
    choices: ['Monitor', 'Speaker', 'Keyboard', 'Printer', 'Projector'],
    correctIndex: 2,
    explanation: 'A keyboard is the primary device used to enter typed text.',
  },
];

export const PROTOTYPE_QUESTIONS: (QuestionVersionData & { status: 'DRAFT' })[] = PROTOTYPE_SEEDS.map((s) => ({
  questionId: '',
  version: 1,
  domain: 'CULTURE_MEDIA',
  difficulty: 'SPARK',
  stem: s.stem,
  choices: s.choices,
  correctIndex: s.correctIndex,
  explanation: s.explanation,
  knowledgeDrop: null,
  sourceTitle: 'premium_quiz.html prototype',
  sourceUrl: 'docs/prototype/premium_quiz.html',
  correctAsOf: '2026-07-21',
  jurisdiction: null,
  sensitivityTier: 1,
  expiresAt: null,
  readTimeSec: 8,
  factKey: s.factKey,
  demoFlag: 'general-trivia',
  status: 'DRAFT',
}));

const DOMAINS: Domain[] = [
  'SCIENCE', 'HISTORY', 'AFRICA_INDIGENOUS', 'LAW_POLICY',
  'HEALTH_SAFETY', 'CULTURE_MEDIA', 'BUSINESS_ETHICS', 'FUTURE_INNOVATION',
];

// Per-domain difficulty mix: 4x SPARK, 4x FLAME, 3x INFERNO, 1x WILD_420 (12 total).
const DIFFICULTY_MIX: Difficulty[] = [
  'SPARK', 'SPARK', 'SPARK', 'SPARK',
  'FLAME', 'FLAME', 'FLAME', 'FLAME',
  'INFERNO', 'INFERNO', 'INFERNO',
  'WILD_420',
];

function buildDemoBank(): (QuestionVersionData & { status: 'APPROVED' })[] {
  const bank: (QuestionVersionData & { status: 'APPROVED' })[] = [];
  let overallIndex = 0;

  for (const domain of DOMAINS) {
    for (let i = 0; i < DIFFICULTY_MIX.length; i++) {
      const n = i + 1; // 1-based per-domain question number
      const difficulty = DIFFICULTY_MIX[i];
      overallIndex += 1;
      const isTier3 = overallIndex % 10 === 0;
      const correctIndex = i % 4;
      const readTimeSec = 7 + (i % 8); // 7..14

      bank.push({
        questionId: '',
        version: 1,
        domain,
        difficulty,
        stem: `[DEMO] ${domain} ${capitalize(difficulty)} question ${n}: which statement is accurate?`,
        choices: [
          `${domain} demo choice A for question ${n}`,
          `${domain} demo choice B for question ${n}`,
          `${domain} demo choice C for question ${n}`,
          `${domain} demo choice D for question ${n}`,
        ],
        correctIndex,
        explanation: `This is a labelled demo explanation for ${domain} question ${n}.`,
        knowledgeDrop: `[DEMO] Knowledge Drop: one surprising verified fact about ${domain} question ${n}.`,
        sourceTitle: 'Demo bank (generated)',
        sourceUrl: 'internal://demo-bank',
        correctAsOf: '2026-07-21',
        jurisdiction: null,
        sensitivityTier: isTier3 ? 3 : 1,
        expiresAt: isTier3 ? '2027-01-01' : null,
        readTimeSec,
        factKey: `demo-${domain.toLowerCase().replace(/_/g, '-')}-${n}`,
        demoFlag: 'demo-seed',
        status: 'APPROVED',
      });
    }
  }

  return bank;
}

function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export const DEMO_BANK: (QuestionVersionData & { status: 'APPROVED' })[] = buildDemoBank();

// Three demo Source Signal entries for a DEMO_BANK question (Task 21): the
// VERIFIED signal restates the correct choice's fact so the lifeline has a
// genuinely correct answer to surface; the other two are clearly-labelled
// demo text per the brief (labelled '[DEMO]' throughout, same convention as
// the rest of buildDemoBank's stems/explanations).
function demoSignalsFor(q: QuestionVersionData): { text: string; kind: 'VERIFIED' | 'UNRELIABLE' | 'DISTRACTOR' }[] {
  const topicNumber = q.factKey.split('-').pop();
  const topic = `${q.domain} question ${topicNumber}`;
  return [
    { text: `[DEMO] Verified: ${q.choices[q.correctIndex]}.`, kind: 'VERIFIED' },
    { text: `[DEMO] A commonly repeated but unreliable belief about ${topic}.`, kind: 'UNRELIABLE' },
    { text: `[DEMO] A plausible but wrong signal about ${topic}.`, kind: 'DISTRACTOR' },
  ];
}

export async function seedDatabase(repos: Repos): Promise<{ imported: number; demo: number }> {
  let imported = 0;
  for (const q of PROTOTYPE_QUESTIONS) {
    if (await repos.questions.existsByFactKey(q.factKey)) continue;
    await repos.questions.create(q);
    imported += 1;
  }

  let demo = 0;
  for (const q of DEMO_BANK) {
    if (await repos.questions.existsByFactKey(q.factKey)) continue;
    const id = await repos.questions.create({ ...q, status: 'DRAFT' });
    await repos.questions.setStatus(id, 'EDITORIAL_REVIEW', 'seed-script');
    // EDITORIAL_REVIEW -> APPROVED is a legal direct transition; tier-3 demo
    // questions carry expiresAt so they pass the tier-3 approval gate without
    // needing a COUNCIL_REVIEW hop.
    await repos.questions.setStatus(id, 'APPROVED', 'seed-script');
    await repos.signals.set(id, demoSignalsFor(q));
    demo += 1;
  }

  return { imported, demo };
}
