import type { StageId } from '../stages/config.js';
import type { UsageSnapshot } from '../telemetry/usage.js';

export interface ReportJsonStageResult {
  stageId: StageId;
  status: 'completed' | 'token-limit-reached' | 'error';
  output: { text: string; outputPath: string };
  usage: UsageSnapshot;
  durationMs: number;
  costUsd: number;
  numTurns: number;
  permissionDenials: number;
  finalTextSource: 'result' | 'fallback-assistant-text' | 'sdk-error' | 'none';
  error?: string;
}

export interface ReportJson {
  runId: string;
  runRoot: string;
  totalUsage: UsageSnapshot;
  totalDurationMs: number;
  totalCostUsd: number;
  stageResults: ReportJsonStageResult[];
  reachedTotalBudget: boolean;
}

export interface FeatureCounts {
  general: number;
  admin: number;
  common: number;
  auth: number;
  websocketDependent: number;
  totalRows: number;
}

export interface SelfCorrectionRow {
  attempt: string;
  changeSummary: string;
  result: string;
  failureCause: 'exploration-gap' | 'scenario-assumption' | 'code-bug' | 'unclassified';
}

export type ReasoningWeight = 'trivial' | 'light' | 'moderate' | 'heavy';

export interface StageRollup {
  stageId: StageId;
  durationMs: number;
  durationShare: number;
  costUsd: number;
  costShare: number;
  cacheReadShare: number;
  numTurns: number;
  reasoningWeight: ReasoningWeight;
  finalTextSource: ReportJsonStageResult['finalTextSource'];
  permissionDenials: number;
}
