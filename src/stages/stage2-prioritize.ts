import { writeFileSync } from 'node:fs';
import type { StageHandler } from './types.js';
import { runStageWithPrompts } from './_helpers.js';
import { fillTemplate, loadPromptTemplate } from '../prompts/loader.js';
import { extractStage2PicksJson } from '../report/picks-parser.js';

export const stage2Handler: StageHandler = async (ctx) => {
  const stage1 = ctx.prior['stage1-mapping'];
  const systemPrompt = loadPromptTemplate('stage2.system.md');
  const userPrompt = fillTemplate(loadPromptTemplate('stage2.user.md'), {
    STAGE1_OUTPUT: stage1?.text ?? '(stage1 산출물 없음)',
  });
  const result = await runStageWithPrompts(ctx, { systemPrompt, userPrompt });

  // stage2 산출물에서 JSON 후보 블록을 추출하여 picks.json 으로 영속화.
  const picks = extractStage2PicksJson(result.output.text);
  if (picks) {
    const picksPath = ctx.runDir.stagePath(ctx.stage.id, 'picks.json');
    writeFileSync(picksPath, JSON.stringify(picks, null, 2), 'utf8');
    ctx.decisionLogger.log({
      stageId: ctx.stage.id,
      category: 'observation',
      message: 'picks.json 영속화',
      data: { candidateCount: picks.candidates.length, picksPath },
    });
  } else {
    ctx.decisionLogger.log({
      stageId: ctx.stage.id,
      category: 'note',
      message: 'picks.json 파싱 실패 — output.md 직접 확인 필요 (사람 게이트에서 --custom 사용 권장)',
    });
  }

  return result;
};
