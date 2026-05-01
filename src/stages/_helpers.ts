import { writeFileSync } from 'node:fs';
import type { StageContext, StageResult, StageStatus } from './types.js';

export interface StagePrompts {
  systemPrompt: string;
  userPrompt: string;
}

export async function runStageWithPrompts(
  ctx: StageContext,
  prompts: StagePrompts,
): Promise<StageResult> {
  const start = Date.now();
  ctx.decisionLogger.log({
    stageId: ctx.stage.id,
    category: 'start',
    message: `${ctx.stage.id} 시작`,
    data: {
      model: ctx.stage.model,
      tokenLimit: ctx.stage.tokenLimit,
      systemPromptChars: prompts.systemPrompt.length,
      userPromptChars: prompts.userPrompt.length,
    },
  });

  const fullSystemPrompt =
    `${prompts.systemPrompt}\n\n` +
    `--- 환경별 가드레일 정책 (오케스트레이터가 자동 주입) ---\n` +
    ctx.config.guardrails.policyText;

  const result = await ctx.sdk.run(
    { model: ctx.stage.model, systemPrompt: fullSystemPrompt, prompt: prompts.userPrompt },
    { usage: ctx.usage, guard: ctx.guard },
  );

  const outputPath = ctx.runDir.stagePath(ctx.stage.id, 'output.md');
  writeFileSync(outputPath, result.finalText, 'utf8');

  const status: StageStatus = result.reachedTokenLimit
    ? 'token-limit-reached'
    : result.isError
      ? 'error'
      : 'completed';

  ctx.decisionLogger.log({
    stageId: ctx.stage.id,
    category: 'end',
    message: `${ctx.stage.id} 종료: ${status}`,
    data: { numTurns: result.numTurns, costUsd: result.costUsd, usage: ctx.usage.current() },
  });

  return {
    stageId: ctx.stage.id,
    status,
    output: { text: result.finalText, outputPath },
    usage: ctx.usage.current(),
    durationMs: Date.now() - start,
    costUsd: result.costUsd,
    numTurns: result.numTurns,
    permissionDenials: result.permissionDenials,
    error: result.isError ? result.finalText : undefined,
  };
}
