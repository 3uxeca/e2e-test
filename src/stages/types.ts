import type { AppConfig } from '../config.js';
import type { StageConfig, StageId } from './config.js';
import type {
  DecisionLogger,
  RunDir,
  TokenGuard,
  UsageAccumulator,
  UsageSnapshot,
} from '../telemetry/index.js';
import type { SdkClient } from '../sdk/client.js';

export interface StageOutput {
  text: string;
  outputPath: string;
}

export interface StageContext {
  config: AppConfig;
  stage: StageConfig;
  runDir: RunDir;
  decisionLogger: DecisionLogger;
  sdk: SdkClient;
  usage: UsageAccumulator;
  guard: TokenGuard;
  prior: Partial<Record<StageId, StageOutput>>;
}

export type StageStatus = 'completed' | 'token-limit-reached' | 'error';

export interface StageResult {
  stageId: StageId;
  status: StageStatus;
  output: StageOutput;
  usage: UsageSnapshot;
  durationMs: number;
  costUsd: number;
  numTurns: number;
  permissionDenials: number;
  error?: string;
}

export type StageHandler = (ctx: StageContext) => Promise<StageResult>;
