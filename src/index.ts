import { loadConfig, type AppConfig } from './config.js';
import { playwrightMcpServers } from './mcp/playwright.js';
import { stageConfigs, totalTokenBudget } from './stages/config.js';
import { runOrchestrator } from './orchestrator/runner.js';
import { createDryRunSdkClient, createLiveSdkClient } from './sdk/client.js';

type Mode = 'sanity' | 'dry-run' | 'live';

function detectMode(): Mode {
  if (process.argv.includes('--sanity')) return 'sanity';
  if (process.env.DRY_RUN === 'true') return 'dry-run';
  return 'live';
}

async function main() {
  const cfg = loadConfig();
  const mode = detectMode();

  if (mode === 'sanity') {
    printSanity(cfg);
    return;
  }

  const sdk = mode === 'dry-run' ? createDryRunSdkClient() : createLiveSdkClient();
  console.log(`[cartographer] mode=${mode} env=${cfg.env}`);
  const report = await runOrchestrator(cfg, sdk);

  console.log('\n[cartographer] orchestrator finished');
  console.log(`  runId             = ${report.runId}`);
  console.log(`  runRoot           = ${report.runRoot}`);
  console.log(`  totalDurationMs   = ${report.totalDurationMs}`);
  console.log(`  totalCostUsd      = $${report.totalCostUsd.toFixed(4)}`);
  console.log(
    `  totalTokens used  = ${report.totalUsage.totalTokens.toLocaleString()} / ` +
      `${totalTokenBudget.toLocaleString()}  (input+output, PROJECT.md 정의)` +
      (report.reachedTotalBudget ? '  [BUDGET REACHED]' : ''),
  );
  console.log(
    `  cache tokens      = creation ${report.totalUsage.cacheCreationInputTokens.toLocaleString()}, ` +
      `read ${report.totalUsage.cacheReadInputTokens.toLocaleString()}`,
  );
  for (const r of report.stageResults) {
    console.log(
      `  - ${r.stageId.padEnd(20)} status=${r.status.padEnd(20)} ` +
        `tokens=${r.usage.totalTokens.toString().padStart(7)} ` +
        `cost=$${r.costUsd.toFixed(4)} ` +
        `turns=${r.numTurns.toString().padStart(2)} ` +
        `denials=${r.permissionDenials} ` +
        `duration=${r.durationMs}ms`,
    );
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
