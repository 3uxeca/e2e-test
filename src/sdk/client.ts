import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { playwrightMcpServers } from '../mcp/playwright.js';
import type { TokenGuard } from '../telemetry/token-guard.js';
import type { UsageAccumulator, UsageDelta } from '../telemetry/usage.js';

export interface SdkRunOptions {
  model: string;
  systemPrompt: string;
  prompt: string;
  cwd?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface SdkRunResult {
  finalText: string;
  numTurns: number;
  durationMs: number;
  costUsd: number;
  isError: boolean;
  reachedTokenLimit: boolean;
  permissionDenials: number;
}

export interface SdkClient {
  run(
    opts: SdkRunOptions,
    telemetry: { usage: UsageAccumulator; guard: TokenGuard },
  ): Promise<SdkRunResult>;
}

interface BetaUsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

function deltaFromBetaUsage(u: BetaUsageLike | undefined): UsageDelta {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheCreationInputTokens: u?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: u?.cache_read_input_tokens ?? 0,
  };
}

export function createLiveSdkClient(): SdkClient {
  return {
    async run(opts, { usage, guard }) {
      const abortController = new AbortController();
      const start = Date.now();

      const sdkOptions: Options = {
        model: opts.model,
        systemPrompt: opts.systemPrompt,
        mcpServers: playwrightMcpServers(),
        cwd: opts.cwd ?? process.cwd(),
        allowedTools: opts.allowedTools,
        disallowedTools: opts.disallowedTools,
        // 1주차 로컬 가드레일이 모든 영역 자유 탐색 + 비가역 액션 자유 실행을
        // 명시 허용하므로, SDK 권한 프롬프트도 bypass한다 (자율 실행 가능 상태).
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        abortController,
      };

      let finalText = '';
      let numTurns = 0;
      let costUsd = 0;
      let isError = false;
      let reachedTokenLimit = false;
      let permissionDenials = 0;

      try {
        const stream = query({ prompt: opts.prompt, options: sdkOptions });
        for await (const msg of stream) {
          if (msg.type === 'assistant') {
            const inner = (msg.message as unknown as { usage?: BetaUsageLike } | undefined)?.usage;
            const snapshot = usage.add(deltaFromBetaUsage(inner));
            if (guard.check(snapshot).exceeded) {
              reachedTokenLimit = true;
              abortController.abort();
              break;
            }
          } else if (msg.type === 'result') {
            numTurns = msg.num_turns;
            costUsd = msg.total_cost_usd;
            isError = msg.is_error;
            permissionDenials = msg.permission_denials.length;
            if (msg.subtype === 'success') {
              finalText = msg.result;
            }
          }
        }
      } catch (err) {
        isError = true;
        finalText = `[sdk error] ${String(err)}`;
      }

      return {
        finalText,
        numTurns,
        durationMs: Date.now() - start,
        costUsd,
        isError,
        reachedTokenLimit,
        permissionDenials,
      };
    },
  };
}

export function createDryRunSdkClient(): SdkClient {
  return {
    async run(opts, { usage, guard }) {
      const start = Date.now();

      const snapshot = usage.add({
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      });
      const reachedTokenLimit = guard.check(snapshot).exceeded;

      const finalText =
        `[DRY_RUN ok] model=${opts.model} ` +
        `systemPromptChars=${opts.systemPrompt.length} promptChars=${opts.prompt.length}`;

      return {
        finalText,
        numTurns: 1,
        durationMs: Date.now() - start,
        costUsd: 0,
        isError: false,
        reachedTokenLimit,
        permissionDenials: 0,
      };
    },
  };
}
