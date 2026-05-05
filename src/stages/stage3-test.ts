import type { StageHandler } from './types.js';
import { runStageWithPrompts } from './_helpers.js';
import { fillTemplate, loadPromptTemplate } from '../prompts/loader.js';

export const stage3Handler: StageHandler = (ctx) => {
  const stage2 = ctx.prior['stage2-prioritize'];
  // 사람이 결정한 최종 플로우(decision-final.json 의 텍스트화) 가 있으면 우선 사용.
  // 없으면(레거시 또는 fallback) stage2 산출물 전문을 그대로 stage3 에 전달.
  const STAGE2_OUTPUT = ctx.selectedFlowText
    ? `${ctx.selectedFlowText}\n\n--- stage2 산출물 (참고) ---\n${stage2?.text ?? ''}`
    : (stage2?.text ?? '(stage2 산출물 없음)');

  const systemPrompt = loadPromptTemplate('stage3.system.md');
  const userPrompt = fillTemplate(loadPromptTemplate('stage3.user.md'), {
    STAGE2_OUTPUT,
    TARGET_URL: ctx.config.targetUrl,
    LOGIN_URL: ctx.config.loginUrl,
    TEST_EMAIL: ctx.config.testEmail,
  });
  return runStageWithPrompts(ctx, { systemPrompt, userPrompt });
};
