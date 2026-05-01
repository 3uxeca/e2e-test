export type StageId = 'stage1-mapping' | 'stage2-prioritize' | 'stage3-test';

export interface StageConfig {
  id: StageId;
  description: string;
  model: string;
  tokenLimit: number;
}

// 1주차: 모든 단계에서 Claude Opus 4.7 단일 모델 사용 (정직한 baseline 확보).
// 2주차에 단계별 모델 분리(예: stage2를 Sonnet) 시 이 파일만 수정한다.
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
    model: 'claude-opus-4-7',
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
