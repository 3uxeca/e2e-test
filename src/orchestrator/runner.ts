import { writeFileSync } from 'node:fs';
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
}

export async function runOrchestrator(config: AppConfig, sdk: SdkClient): Promise<RunReport> {
  const runDir = createRunDir();
  const decisionLogger = new DecisionLogger(runDir.metaPath('decisions.jsonl'));

  decisionLogger.log({
    category: 'orchestrator-start',
    message: '오케스트레이터 시작',
    data: { env: config.env, totalBudget: totalTokenBudget, runId: runDir.id },
  });

  const stageResults: StageResult[] = [];
  const prior: Record<string, unknown> = {};
  let totalUsage: UsageSnapshot = { ...ZERO_USAGE };
  const orchestratorStart = Date.now();

  for (const stageId of stageOrder) {
    const stage = stageConfigs[stageId];
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
    };

    const result = await stageHandlers[stageId](ctx);
    stageResults.push(result);
    prior[stageId] = result.output;
    totalUsage = addUsage(totalUsage, result.usage);

    if (result.status === 'token-limit-reached') {
      decisionLogger.log({
        stageId,
        category: 'token-limit',
        message: '토큰 상한 도달 — 강제 종료 후 다음 단계로 진행',
        data: { stageUsage: result.usage, totalUsage },
      });
    }
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
  };

  writeFileSync(runDir.metaPath('report.json'), JSON.stringify(report, null, 2), 'utf8');
  decisionLogger.log({
    category: 'orchestrator-end',
    message: '오케스트레이터 종료',
    data: { runId: report.runId, totalUsage, reachedTotalBudget: report.reachedTotalBudget },
  });

  return report;
}
