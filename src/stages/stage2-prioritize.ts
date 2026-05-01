import type { StageHandler } from './types.js';
import { runStageWithPrompts } from './_helpers.js';
import { fillTemplate, loadPromptTemplate } from '../prompts/loader.js';

export const stage2Handler: StageHandler = (ctx) => {
  const stage1 = ctx.prior['stage1-mapping'];
  const systemPrompt = loadPromptTemplate('stage2.system.md');
  const userPrompt = fillTemplate(loadPromptTemplate('stage2.user.md'), {
    STAGE1_OUTPUT: stage1?.text ?? '(stage1 산출물 없음)',
  });
  return runStageWithPrompts(ctx, { systemPrompt, userPrompt });
};
