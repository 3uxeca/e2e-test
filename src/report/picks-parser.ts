import { z } from 'zod';

const candidateSchema = z.object({
  rank: z.number().int().min(1).max(3),
  flowName: z.string(),
  route: z.string(),
  area: z.string(),
  confidence: z.number().int().min(1).max(5),
  rationale: z.string(),
  evidenceSignals: z.object({
    domSignals: z.array(z.string()),
    routingSignals: z.array(z.string()),
  }),
  scenario: z.array(z.string()),
});

const picksSchema = z.object({
  candidates: z.array(candidateSchema).length(3),
});

export type PicksCandidate = z.infer<typeof candidateSchema>;
export type PicksJson = z.infer<typeof picksSchema>;

export function extractStage2PicksJson(stage2Markdown: string): PicksJson | null {
  const m = stage2Markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m || !m[1]) return null;
  try {
    const raw = JSON.parse(m[1]) as unknown;
    return picksSchema.parse(raw);
  } catch {
    return null;
  }
}

export interface DecisionFinal {
  agentTop1Route: string | null;
  humanPick:
    | { source: 'agent-pick'; index: 1 | 2 | 3; route: string; flowName: string; comment?: string }
    | { source: 'custom'; custom: string; comment?: string };
  agreement: boolean;
  decidedAt: string;
}

export interface HistoryEntry {
  runId: string;
  ts: string;
  agentTop1Route: string | null;
  humanPickRoute: string | null;
  humanPickSource: 'agent-pick' | 'custom';
  pickIndex?: number;
  agreement: boolean;
  comment?: string;
}
