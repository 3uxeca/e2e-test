import { loadConfig } from '../config.js';
import { createDryRunSdkClient, createLiveSdkClient } from '../sdk/client.js';
import { continueRun, type ContinueArgs } from '../orchestrator/continue.js';
import { totalTokenBudget } from '../stages/config.js';

function usage(): never {
  console.error(
    [
      'usage: pnpm continue <runId> [--pick=1|2|3] [--custom="..."] [--comment="..."]',
      '',
      'examples:',
      '  pnpm continue 2026-05-05T05-27-19-932Z',
      '  pnpm continue <runId> --pick=2 --comment="검색 사용 빈도가 가장 높음"',
      '  pnpm continue <runId> --custom="에이전트 top3에 없는 플로우 설명"',
    ].join('\n'),
  );
  process.exit(2);
}

function parseArgs(argv: string[]): ContinueArgs {
  const runId = argv[2];
  if (!runId || runId.startsWith('--')) usage();
  const out: ContinueArgs = { runId };
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--pick=')) {
      const n = Number(arg.slice('--pick='.length));
      if (n !== 1 && n !== 2 && n !== 3) {
        console.error(`--pick must be 1, 2, or 3. got: ${arg}`);
        process.exit(2);
      }
      out.pick = n as 1 | 2 | 3;
    } else if (arg.startsWith('--custom=')) {
      out.custom = arg.slice('--custom='.length);
    } else if (arg.startsWith('--comment=')) {
      out.comment = arg.slice('--comment='.length);
    } else {
      console.error(`unknown argument: ${arg}`);
      usage();
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  const sdk = process.env.DRY_RUN === 'true' ? createDryRunSdkClient() : createLiveSdkClient();
  const { decision, report } = await continueRun(cfg, sdk, args);

  console.log(`[continue] decided  agreement=${decision.agreement}`);
  console.log(`[continue] decision: ${JSON.stringify(decision.humanPick)}`);
  console.log(`[continue] runRoot:  ${report.runRoot}`);
  console.log(
    `[continue] totalTokens used  ${report.totalUsage.totalTokens.toLocaleString()} / ` +
      `${totalTokenBudget.toLocaleString()}` +
      (report.reachedTotalBudget ? '  [BUDGET REACHED]' : ''),
  );
  console.log(
    `[continue] totalCostUsd      $${report.totalCostUsd.toFixed(4)} (Console pricing equivalent)`,
  );
  for (const r of report.stageResults) {
    console.log(
      `  - ${r.stageId.padEnd(20)} status=${r.status.padEnd(20)} ` +
        `tokens=${r.usage.totalTokens.toString().padStart(7)} ` +
        `turns=${r.numTurns.toString().padStart(2)} duration=${r.durationMs}ms`,
    );
  }
}

main().catch((err) => {
  console.error('[continue] failed', err);
  process.exit(1);
});
