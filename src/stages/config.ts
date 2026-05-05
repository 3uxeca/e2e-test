export type StageId = 'stage1-mapping' | 'stage2-prioritize' | 'stage3-test';

export interface StageConfig {
  id: StageId;
  description: string;
  model: string;
  tokenLimit: number;
}

// 단계별 모델 정책 (1주차 → 2주차 escalation):
// - 1주차 baseline (run #3, run #4): 모든 단계에서 Claude Opus 4.7.
// - 2주차 P1-B (현재): stage2만 Sonnet 4.6 다운그레이드 (1턴/추론only 패턴이라
//   가장 안전한 첫 분리 후보). 나머지는 Opus 유지. 품질이 떨어지면 즉시 롤백.
//   상세는 docs/week2-plan.md, docs/run4-results.md §4 참고.
export const stageConfigs: Record<StageId, StageConfig> = {
  'stage1-mapping': {
    id: 'stage1-mapping',
    description: '탐색 + 기능 매핑',
    model: 'claude-opus-4-7',
    tokenLimit: 50_000,
  },
  'stage2-prioritize': {
    id: 'stage2-prioritize',
    description: '우선순위 판단',
    model: 'claude-sonnet-4-6',
    tokenLimit: 15_000,
  },
  'stage3-test': {
    id: 'stage3-test',
    description: '테스트 작성 + 자가 수정 (최대 3회)',
    model: 'claude-opus-4-7',
    tokenLimit: 100_000,
  },
};

export const totalTokenBudget: number = Object.values(stageConfigs).reduce(
  (sum, s) => sum + s.tokenLimit,
  0,
);
