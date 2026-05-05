import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../config.js';
import type { SdkClient } from '../sdk/client.js';
import type {
  DecisionFinal,
  HistoryEntry,
  PicksCandidate,
  PicksJson,
} from '../report/picks-parser.js';
import { resumeStage3, type RunReport } from './runner.js';

export interface ContinueArgs {
  runId: string;
  pick?: 1 | 2 | 3;
  custom?: string;
  comment?: string;
}

const HISTORY_PATH = 'data/experiment-history.jsonl';

function loadPicks(runId: string): PicksJson | null {
  const p = join('runs', runId, 'stage2-prioritize', 'picks.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as PicksJson;
}

function findCandidate(picks: PicksJson, rank: number): PicksCandidate | undefined {
  return picks.candidates.find((c) => c.rank === rank);
}

function flowToText(flow: { flowName: string; route: string; scenario: string[] }): string {
  return [
    `# 사람이 최종 선택한 플로우 (stage3 의 source-of-truth)`,
    ``,
    `- 플로우 이름: ${flow.flowName}`,
    `- 라우트: ${flow.route}`,
    ``,
    `## 단계 시나리오`,
    ...flow.scenario.map((s) => `- ${s}`),
  ].join('\n');
}

function customFlowToText(custom: string): string {
  return [
    `# 사람이 직접 지정한 플로우 (custom override)`,
    ``,
    `${custom}`,
    ``,
    `(에이전트의 top3 후보 모두를 거부하고 사람이 새로 지정한 플로우다.)`,
  ].join('\n');
}

export interface ContinueResult {
  decision: DecisionFinal;
  report: RunReport;
}

export async function continueRun(
  config: AppConfig,
  sdk: SdkClient,
  args: ContinueArgs,
): Promise<ContinueResult> {
  const picks = loadPicks(args.runId);
  if (!picks && !args.custom) {
    throw new Error(
      `picks.json 이 없습니다 (runs/${args.runId}/stage2-prioritize/picks.json). ` +
        `--custom="..." 으로 사람이 직접 플로우를 지정하세요.`,
    );
  }

  const agentTop1 = picks ? findCandidate(picks, 1) : undefined;
  const agentTop1Route = agentTop1?.route ?? null;

  let decision: DecisionFinal;
  let selectedFlowText: string;

  if (args.custom) {
    decision = {
      agentTop1Route,
      humanPick: { source: 'custom', custom: args.custom, comment: args.comment },
      agreement: false,
      decidedAt: new Date().toISOString(),
    };
    selectedFlowText = customFlowToText(args.custom);
  } else {
    const pickRank = (args.pick ?? 1) as 1 | 2 | 3;
    const cand = findCandidate(picks!, pickRank);
    if (!cand) {
      throw new Error(`pick=${pickRank} 후보가 picks.json 에 없습니다.`);
    }
    decision = {
      agentTop1Route,
      humanPick: {
        source: 'agent-pick',
        index: pickRank,
        route: cand.route,
        flowName: cand.flowName,
        comment: args.comment,
      },
      agreement: pickRank === 1,
      decidedAt: new Date().toISOString(),
    };
    selectedFlowText = flowToText(cand);
  }

  // decision-final.json 영속화
  const decisionPath = join('runs', args.runId, 'decision-final.json');
  writeFileSync(decisionPath, JSON.stringify(decision, null, 2), 'utf8');

  // experiment-history.jsonl append (모든 라이브 누적)
  const humanPickRoute =
    decision.humanPick.source === 'agent-pick' ? decision.humanPick.route : null;
  const historyEntry: HistoryEntry = {
    runId: args.runId,
    ts: decision.decidedAt,
    agentTop1Route,
    humanPickRoute,
    humanPickSource: decision.humanPick.source,
    pickIndex:
      decision.humanPick.source === 'agent-pick' ? decision.humanPick.index : undefined,
    agreement: decision.agreement,
    comment: args.comment,
  };
  mkdirSync('data', { recursive: true });
  appendFileSync(HISTORY_PATH, JSON.stringify(historyEntry) + '\n', 'utf8');

  // stage3 실행
  const report = await resumeStage3(config, sdk, args.runId, selectedFlowText);
  return { decision, report };
}
