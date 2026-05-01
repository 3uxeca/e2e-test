export interface UsageDelta {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface UsageSnapshot extends UsageDelta {
  totalTokens: number;
}

export const ZERO_USAGE: UsageSnapshot = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  totalTokens: 0,
};

export function addUsage(a: UsageSnapshot, b: UsageDelta): UsageSnapshot {
  const inputTokens = a.inputTokens + b.inputTokens;
  const outputTokens = a.outputTokens + b.outputTokens;
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export class UsageAccumulator {
  private snapshot: UsageSnapshot = { ...ZERO_USAGE };

  add(delta: UsageDelta): UsageSnapshot {
    this.snapshot = addUsage(this.snapshot, delta);
    return this.snapshot;
  }

  current(): UsageSnapshot {
    return { ...this.snapshot };
  }

  reset(): void {
    this.snapshot = { ...ZERO_USAGE };
  }
}
