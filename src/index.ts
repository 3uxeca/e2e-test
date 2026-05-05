import { loadConfig, type AppConfig } from './config.js';
import { playwrightMcpServers } from './mcp/playwright.js';
import { stageConfigs, totalTokenBudget } from './stages/config.js';
import { runOrchestrator } from './orchestrator/runner.js';
import { continueRun } from './orchestrator/continue.js';
import { createDryRunSdkClient, createLiveSdkClient } from './sdk/client.js';

type Mode = 'sanity' | 'dry-run' | 'live';

interface CliFlags {
  mode: Mode;
  autoPick?: 1 | 2 | 3;
}

function parseFlags(): CliFlags {
  const argv = process.argv.slice(2);
  const flags: CliFlags = {
    mode: argv.includes('--sanity')
      ? 'sanity'
      : process.env.DRY_RUN === 'true'
        ? 'dry-run'
        : 'live',
  };
  for (const a of argv) {
    if (a.startsWith('--auto-pick=')) {
      const n = Number(a.split('=')[1]);
      if (n === 1 || n === 2 || n === 3) flags.autoPick = n;
    }
  }
  return flags;
}

async function main() {
  const cfg = loadConfig();
  const flags = parseFlags();

  if (flags.mode === 'sanity') {
    printSanity(cfg);
    return;
  }

  const sdk = flags.mode === 'dry-run' ? createDryRunSdkClient() : createLiveSdkClient();
  console.log(`[cartographer] mode=${flags.mode} env=${cfg.env}` + (flags.autoPick ? ` auto-pick=${flags.autoPick}` : ' (human-gate)'));

  // Default: run stages 1+2 only, then exit and instruct human gate.
  // --auto-pick=N: run all stages, with stage3 using picks #N (or fallback).
  const stage12Report = await runOrchestrator(cfg, sdk, { stopAfterStage2: true });

  console.log('\n[cartographer] stage1+2 finished');
  console.log(`  runId             = ${stage12Report.runId}`);
  console.log(`  runRoot           = ${stage12Report.runRoot}`);
  console.log(
    `  totalTokens (so far) = ${stage12Report.totalUsage.totalTokens.toLocaleString()} ` +
      `(input+output, PROJECT.md 정의)`,
  );
  console.log(
    `  totalCostUsd        = $${stage12Report.totalCostUsd.toFixed(4)} (Console pricing equivalent)`,
  );
  for (const r of stage12Report.stageResults) {
    console.log(
      `  - ${r.stageId.padEnd(20)} status=${r.status.padEnd(20)} ` +
        `tokens=${r.usage.totalTokens.toString().padStart(7)} ` +
        `turns=${r.numTurns.toString().padStart(2)} duration=${r.durationMs}ms`,
    );
  }

  if (flags.autoPick) {
    console.log(`\n[cartographer] --auto-pick=${flags.autoPick} → 사람 게이트 우회, 자동 continue`);
    const { decision, report } = await continueRun(cfg, sdk, {
      runId: stage12Report.runId,
      pick: flags.autoPick,
    });
    console.log(`[continue] agreement=${decision.agreement}`);
    console.log(`[continue] totalCostUsd = $${report.totalCostUsd.toFixed(4)}`);
  } else {
    console.log('\n[cartographer] 사람 게이트 대기 — 다음 단계 안내');
    console.log(`  picks 후보 보기:`);
    console.log(`    cat runs/${stage12Report.runId}/stage2-prioritize/picks.json`);
    console.log(`  계속 진행 (에이전트 1순위 그대로):`);
    console.log(`    pnpm continue ${stage12Report.runId}`);
    console.log(`  순위 변경 (예: 2순위로 + 코멘트):`);
    console.log(`    pnpm continue ${stage12Report.runId} --pick=2 --comment="..."`);
    console.log(`  새 플로우 직접 지정:`);
    console.log(`    pnpm continue ${stage12Report.runId} --custom="..." --comment="..."`);
  }
}

function printSanity(cfg: AppConfig) {
  const mcp = playwrightMcpServers();
  console.log('[cartographer] config sanity check');
  console.log(`  ENV                = ${cfg.env}`);
  console.log(`  TARGET_URL         = ${cfg.targetUrl}`);
  console.log(`  LOGIN_URL          = ${cfg.loginUrl}`);
  console.log(`  TEST_EMAIL         = ${cfg.testEmail}`);
  console.log(`  TEST_PASSWORD      = ${cfg.testPassword ? '(set)' : '(missing)'}`);
  console.log(
    `  ANTHROPIC_API_KEY  = ${cfg.anthropicApiKey ? '(set)' : '(unset — will use Claude Code CLI OAuth)'}`,
  );
  console.log('  Playwright MCP servers:');
  for (const [name, srv] of Object.entries(mcp)) {
    if (srv.type === 'stdio') {
      console.log(`    ${name}: stdio ${srv.command} ${srv.args?.join(' ') ?? ''}`);
    } else {
      console.log(`    ${name}: ${srv.type}`);
    }
  }
  console.log('  Stage configs:');
  for (const stage of Object.values(stageConfigs)) {
    console.log(
      `    ${stage.id.padEnd(20)} model=${stage.model} ` +
        `tokenLimit=${stage.tokenLimit.toLocaleString()}`,
    );
  }
  console.log(`    total token budget   ${totalTokenBudget.toLocaleString()} / run`);
  console.log('  Guardrail policy:');
  for (const line of cfg.guardrails.policyText.split('\n')) {
    console.log(`    ${line}`);
  }
}

main().catch((err) => {
  console.error('[cartographer] failed', err);
  process.exit(1);
});
