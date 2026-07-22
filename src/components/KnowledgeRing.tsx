import type { JSX } from 'react';
import type { Difficulty } from '@/domain/types';

export type RingSegmentState = 'pending' | 'active' | 'correct' | 'wrong';

export interface KnowledgeRingProps {
  segments: RingSegmentState[];       // one per question, e.g. 17
  ringState: 'idle' | 'live' | 'locked' | 'victory';
  difficulty?: Difficulty | 'HIDDEN';
  size?: number;                      // px, default 480
}

const VIEWBOX_SIZE = 512;
const CENTER = VIEWBOX_SIZE / 2;
const RADIUS = 200;
const STROKE_WIDTH = 28;
const GAP_DEG = 2;
const FRACTURE_TICK_HALF_LEN = 10;
const FRACTURE_ROTATION_DEG = 12;

const RING_STATE_CLASS: Record<KnowledgeRingProps['ringState'], string> = {
  idle: 'ring-idle',
  live: 'ring-live',
  locked: 'ring-pulse',
  victory: 'ring-victory',
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function difficultyColor(difficulty: KnowledgeRingProps['difficulty']): string {
  switch (difficulty) {
    case 'SPARK':
      return 'var(--amber-bright)';
    case 'FLAME':
      return 'var(--amber-deep)';
    case 'INFERNO':
      return 'var(--ultraviolet)';
    case 'HIDDEN':
      return 'var(--offwhite)';
    case 'WILD_420':
      return 'url(#wild420Gradient)';
    default:
      return 'var(--amber-bright)';
  }
}

function segmentStroke(
  state: RingSegmentState,
  difficulty: KnowledgeRingProps['difficulty'],
): { stroke: string; strokeOpacity?: number } {
  switch (state) {
    case 'pending':
      return { stroke: 'var(--graphite-500)' };
    case 'active':
      return difficulty === 'HIDDEN'
        ? { stroke: difficultyColor(difficulty), strokeOpacity: 0.4 }
        : { stroke: difficultyColor(difficulty) };
    case 'correct':
      return { stroke: 'var(--amber-deep)' };
    case 'wrong':
      return { stroke: 'var(--graphite-500)' };
  }
}

export function KnowledgeRing(props: KnowledgeRingProps): JSX.Element {
  const { segments, ringState, difficulty, size = 480 } = props;
  const n = segments.length;
  const anglePerSegment = n > 0 ? 360 / n : 0;
  const sweep = anglePerSegment - GAP_DEG;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      width={size}
      height={size}
      className={`knowledge-ring ${RING_STATE_CLASS[ringState]}`}
      data-ring-state={ringState}
    >
      <defs>
        <linearGradient id="wild420Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--amber-bright)" />
          <stop offset="25%" stopColor="var(--ultraviolet)" />
          <stop offset="50%" stopColor="var(--amber-bright)" />
          <stop offset="75%" stopColor="var(--ultraviolet)" />
          <stop offset="100%" stopColor="var(--amber-bright)" />
        </linearGradient>
      </defs>
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="var(--graphite-700)"
        strokeWidth={STROKE_WIDTH}
      />
      {segments.map((state, i) => {
        const startAngle = i * anglePerSegment + GAP_DEG / 2;
        const endAngle = startAngle + sweep;
        const midAngle = (startAngle + endAngle) / 2;
        const { stroke, strokeOpacity } = segmentStroke(state, difficulty);
        const path = describeArc(CENTER, CENTER, RADIUS, startAngle, endAngle);
        const mid = polarToCartesian(CENTER, CENTER, RADIUS, midAngle);

        return (
          <g key={i} data-testid={`ring-seg-${i}`} data-state={state}>
            <path
              d={path}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="butt"
              fill="none"
            />
            {state === 'wrong' && (
              <line
                x1={mid.x - FRACTURE_TICK_HALF_LEN}
                y1={mid.y}
                x2={mid.x + FRACTURE_TICK_HALF_LEN}
                y2={mid.y}
                stroke="var(--offwhite)"
                strokeWidth={3}
                transform={`rotate(${FRACTURE_ROTATION_DEG} ${mid.x} ${mid.y})`}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
