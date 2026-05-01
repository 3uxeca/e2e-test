import type { UsageSnapshot } from './usage.js';

export interface TokenGuardResult {
  exceeded: boolean;
  limit: number;
  usedTokens: number;
}

export class TokenGuard {
  constructor(private readonly limit: number) {}

  check(usage: UsageSnapshot): TokenGuardResult {
    const usedTokens = usage.totalTokens;
    return {
      exceeded: usedTokens >= this.limit,
      limit: this.limit,
      usedTokens,
    };
  }
}
