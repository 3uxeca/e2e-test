import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../config.js';
import { stageConfigs, totalTokenBudget, type StageId } from '../stages/config.js';
import type { StageContext, StageHandler, StageResult } from '../stages/types.js';
import { stage1Handler } from '../stages/stage1-mapping.js';
import { stage2Handler } from '../stages/stage2-prioritize.js';
import { stage3Handler } from '../stages/stage3-test.js';
import {
  addUsage,
  createRunDir,
  DecisionLogger,
  TokenGuard,
  UsageAccumulator,
  ZERO_USAGE,
  type RunDir,
  type UsageSnapshot,
} from '../telemetry/index.js';
import type { SdkClient } from '../sdk/client.js';

const stageOrder: StageId[] = ['stage1-mapping', 'stage2-prioritize', 'stage3-test'];

const stageHandlers: Record<StageId, StageHandler> = {
  'stage1-mapping': stage1Handler,
  'stage2-prioritize': stage2Handler,
  'stage3-test': stage3Handler,
};

export interface RunReport {
  runId: string;
  runRoot: string;
  totalUsage: UsageSnapshot;
  totalDurationMs: number;
  totalCostUsd: number;
  stageResults: StageResult[];
  reachedTotalBudget: boolean;
  /** true 이면 stage1+2 까지만 실행되고 stage3 는 사람 게이트 대기 상태. */
  awaitingHumanGate?: boolean;
}

export interface OrchestratorOptions {
  /** true 이면 stage2 까지만 실행하고 stage3 는 continueRun() 으로 미룬다. */
  stopAfterStage2?: boolean;
}

function reconstructRunDir(runId: string, runsRoot = 'runs'): RunDir {
  const root = join(runsRoot, runId);
  return {
    id: runId,
    root,
    stagePath(stageId, fileName) {
      const stageDir = join(root, stageId);
      mkdirSync(stageDir, { recursive: true });
      return join(stageDir, fileName);
    },
    metaPath(name) {
      return join(root, name);
    },
  };
}

async function runStage(
  stageId: StageId,
  ctx: StageContext,
  decisionLogger: DecisionLogger,
): Promise<StageResult> {
  const result = await stageHandlers[stageId](ctx);
  if (result.status === 'token-limit-reached') {
    decisionLogger.log({
      stageId,
      category: 'token-limit',
      message: '토큰 상한 도달 — 강제 종료 후 다음 단계로 진행',
      data: { stageUsage: result.usage, total: 'see report.json' },
    });
  }
  return result;
}

export async function runOrchestrator(
  config: AppConfig,
  sdk: SdkClient,
  options: OrchestratorOptions = {},
): Promise<RunReport> {
  const runDir = createRunDir();
  const decisionLogger = new DecisionLogger(runDir.metaPath('decisions.jsonl'));
  decisionLogger.log({
    category: 'orchestrator-start',
    message: '오케스트레이터 시작',
    data: {
      env: config.env,
      totalBudget: totalTokenBudget,
      runId: runDir.id,
      stopAfterStage2: !!options.stopAfterStage2,
    },
  });

  const stages: StageId[] = options.stopAfterStage2
    ? ['stage1-mapping', 'stage2-prioritize']
    : stageOrder;

  const stageResults: StageResult[] = [];
  const prior: Partial<Record<StageId, StageResult['output']>> = {};
  let totalUsage: UsageSnapshot = { ...ZERO_USAGE };
  const orchestratorStart = Date.now();

  for (const stageId of stages) {
    const stage = stageConfigs[stageId];
    const usage = new UsageAccumulator();
    const guard = new TokenGuard(stage.tokenLimit);
    const ctx: StageContext = { config, stage, runDir, decisionLogger, sdk, usage, guard, prior };
    const result = await runStage(stageId, ctx, decisionLogger);
    stageResults.push(result);
    prior[stageId] = result.output;
    totalUsage = addUsage(totalUsage, result.usage);
  }

  const totalCostUsd = stageResults.reduce((s, r) => s + r.costUsd, 0);
  const report: RunReport = {
    runId: runDir.id,
    runRoot: runDir.root,
    totalUsage,
    totalDurationMs: Date.now() - orchestratorStart,
    totalCostUsd,
    stageResults,
    reachedTotalBudget: totalUsage.totalTokens >= totalTokenBudget,
    awaitingHumanGate: !!options.stopAfterStage2,
  };

  writeFileSync(runDir.metaPath('report.json'), JSON.stringify(report, null, 2), 'utf8');
  decisionLogger.log({
    category: 'orchestrator-end',
    message: options.stopAfterStage2
      ? '오케스트레이터 stage1+2 완료 — 사람 게이트 대기'
      : '오케스트레이터 종료',
    data: { runId: report.runId, totalUsage, awaitingHumanGate: !!options.stopAfterStage2 },
  });

  return report;
}

/** stage3 만 별도 실행 (사람 게이트 통과 후). 기존 runDir 에 결과를 추가한다. */
export async function resumeStage3(
  config: AppConfig,
  sdk: SdkClient,
  runId: string,
  selectedFlowText: string,
): Promise<RunReport> {
  const runDir = reconstructRunDir(runId);
  const reportPath = runDir.metaPath('report.json');
  if (!existsSync(reportPath)) {
    throw new Error(`runs/${runId}/report.json 이 없습니다 — runId 확인`);
  }
  const partial = JSON.parse(readFileSync(reportPath, 'utf8')) as RunReport;
  const decisionLogger = new DecisionLogger(runDir.metaPath('decisions.jsonl'));
  decisionLogger.log({
    category: 'orchestrator-start',
    message: 'resumeStage3 시작 (사람 게이트 통과)',
    data: { runId, selectedFlowChars: selectedFlowText.length },
  });

  // prior 재구성: stage1, stage2 의 output 만 필요.
  const prior: Partial<Record<StageId, StageResult['output']>> = {};
  for (const r of partial.stageResults) prior[r.stageId] = r.output;

  const stage = stageConfigs['stage3-test'];
  const usage = new UsageAccumulator();
  const guard = new TokenGuard(stage.tokenLimit);
  const ctx: StageContext = {
    config,
    stage,
    runDir,
    decisionLogger,
    sdk,
    usage,
    guard,
    prior,
    selectedFlowText,
  };

  const orchestratorStart = Date.now();
  const stage3Result = await runStage('stage3-test', ctx, decisionLogger);

  const stageResults = [...partial.stageResults, stage3Result];
  const totalUsage = stageResults.reduce<UsageSnapshot>((acc, r) => addUsage(acc, r.usage), {
    ...ZERO_USAGE,
  });
  const totalCostUsd = stageResults.reduce((s, r) => s + r.costUsd, 0);
  const totalDurationMs = (partial.totalDurationMs ?? 0) + (Date.now() - orchestratorStart);
  const report: RunReport = {
    runId,
    runRoot: runDir.root,
    totalUsage,
    totalDurationMs,
    totalCostUsd,
    stageResults,
    reachedTotalBudget: totalUsage.totalTokens >= totalTokenBudget,
    awaitingHumanGate: false,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  decisionLogger.log({
    category: 'orchestrator-end',
    message: 'resumeStage3 종료',
    data: { runId, totalUsage },
  });
  return report;
}
