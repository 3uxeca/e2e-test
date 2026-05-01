import type { StageHandler } from './types.js';
import { runStageWithPrompts } from './_helpers.js';
import { fillTemplate, loadPromptTemplate } from '../prompts/loader.js';

export const stage3Handler: StageHandler = (ctx) => {
  const stage2 = ctx.prior['stage2-prioritize'];
  const systemPrompt = loadPromptTemplate('stage3.system.md');
  const userPrompt = fillTemplate(loadPromptTemplate('stage3.user.md'), {
    STAGE2_OUTPUT: stage2?.text ?? '(stage2 산출물 없음)',
    TARGET_URL: ctx.config.targetUrl,
    LOGIN_URL: ctx.config.loginUrl,
    TEST_EMAIL: ctx.config.testEmail,
  });
  return runStageWithPrompts(ctx, { systemPrompt, userPrompt });
};
