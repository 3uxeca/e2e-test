import type { StageHandler } from './types.js';
import { runStageWithPrompts } from './_helpers.js';
import { fillTemplate, loadPromptTemplate } from '../prompts/loader.js';

export const stage1Handler: StageHandler = (ctx) => {
  const systemPrompt = loadPromptTemplate('stage1.system.md');
  const userPrompt = fillTemplate(loadPromptTemplate('stage1.user.md'), {
    TARGET_URL: ctx.config.targetUrl,
    LOGIN_URL: ctx.config.loginUrl,
    TEST_EMAIL: ctx.config.testEmail,
    TEST_PASSWORD: ctx.config.testPassword,
  });
  return runStageWithPrompts(ctx, { systemPrompt, userPrompt });
};
