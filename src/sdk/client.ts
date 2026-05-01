import { appendFileSync, openSync, closeSync } from 'node:fs';
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
  messagesLogPath?: string;
}

export interface SdkRunResult {
  finalText: string;
  finalTextSource: 'result' | 'fallback-assistant-text' | 'sdk-error' | 'none';
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

interface BetaContentBlock {
  type?: string;
  text?: string;
}

function extractAssistantText(message: unknown): string {
  const content = (message as { content?: BetaContentBlock[] } | undefined)?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('');
}

function ensureLogFile(path: string | undefined): string | undefined {
  if (!path) return undefined;
  closeSync(openSync(path, 'w'));
  return path;
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

      const messagesLogPath = ensureLogFile(opts.messagesLogPath);
      let resultText = '';
      let assistantTextBuffer = '';
      let finalTextSource: SdkRunResult['finalTextSource'] = 'none';
      let numTurns = 0;
      let costUsd = 0;
      let isError = false;
      let reachedTokenLimit = false;
      let permissionDenials = 0;

      try {
        const stream = query({ prompt: opts.prompt, options: sdkOptions });
        for await (const msg of stream) {
          if (messagesLogPath) {
            appendFileSync(messagesLogPath, JSON.stringify(msg) + '\n', 'utf8');
          }

          if (msg.type === 'assistant') {
            const inner = (msg.message as unknown as { usage?: BetaUsageLike } | undefined)?.usage;
            const snapshot = usage.add(deltaFromBetaUsage(inner));
            assistantTextBuffer += extractAssistantText(msg.message);
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
              resultText = msg.result;
            }
          }
        }
      } catch (err) {
        isError = true;
        resultText = `[sdk error] ${String(err)}`;
        finalTextSource = 'sdk-error';
      }

      let finalText: string;
      if (resultText.trim().length > 0) {
        finalText = resultText;
        if (finalTextSource === 'none') finalTextSource = 'result';
      } else if (assistantTextBuffer.trim().length > 0) {
        finalText = assistantTextBuffer;
        finalTextSource = 'fallback-assistant-text';
      } else {
        finalText = '';
      }

      return {
        finalText,
        finalTextSource,
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
        finalTextSource: 'result',
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
