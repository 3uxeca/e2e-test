import 'dotenv/config';
import { z } from 'zod';
import { selectGuardrailPolicy } from './guardrails/index.js';
import type { EnvName, GuardrailPolicy } from './guardrails/types.js';

const envSchema = z.object({
  ENV: z.enum(['local', 'staging', 'prod']).default('local'),
  TARGET_URL: z.string().url(),
  LOGIN_URL: z.string().url(),
  TEST_EMAIL: z.string().email(),
  TEST_PASSWORD: z.string().min(1),
  // Max/Pro plan 사용자는 Claude Code CLI OAuth 자격증명을 그대로 사용하므로 비워둘 수 있다.
  // Console 결제(API key) 사용자만 값을 채우면 된다.
  ANTHROPIC_API_KEY: z.string().optional(),
  // 시드 데이터 가정 — docs/seed-assumptions.md 참고. 모두 선택.
  SEED_REPLAY_DATE: z.string().optional(),
  SEED_REPLAY_START_TIME: z.string().optional(),
  SEED_REPLAY_END_TIME: z.string().optional(),
});

export interface SeedAssumptions {
  replayDate?: string;
  replayStartTime?: string;
  replayEndTime?: string;
}

export interface AppConfig {
  env: EnvName;
  targetUrl: string;
  loginUrl: string;
  testEmail: string;
  testPassword: string;
  anthropicApiKey: string | undefined;
  guardrails: GuardrailPolicy;
  seed: SeedAssumptions;
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);
  return {
    env: parsed.ENV,
    targetUrl: parsed.TARGET_URL,
    loginUrl: parsed.LOGIN_URL,
    testEmail: parsed.TEST_EMAIL,
    testPassword: parsed.TEST_PASSWORD,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    guardrails: selectGuardrailPolicy(parsed.ENV),
    seed: {
      replayDate: parsed.SEED_REPLAY_DATE || undefined,
      replayStartTime: parsed.SEED_REPLAY_START_TIME || undefined,
      replayEndTime: parsed.SEED_REPLAY_END_TIME || undefined,
    },
  };
}
