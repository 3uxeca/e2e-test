import type { GuardrailPolicy } from './types.js';

export const localPolicy: GuardrailPolicy = {
  env: 'local',
  allowAdminAreaAccess: true,
  allowIrreversibleActions: 'free',
  allowPaymentOrExternalNotifications: 'mock-only',
  maxRepeatedActions: 5,
  ambiguousActionPolicy: 'block-and-ask',
  excludeWebsocketDependentFeatures: true,
  policyText: `[환경: local (1주차)]
- 관리자 페이지 포함 모든 영역을 탐색·테스트할 수 있다.
- 비가역 액션(삭제 등)도 자유롭게 실행할 수 있다 (DB 리셋 가능 환경).
- 결제/외부 알림 발송은 mock 한정 허용한다.
- 동일한 액션을 5회 이상 반복하면 즉시 중단한다.
- 단계별 토큰 상한 (stage1=50k / stage2=15k / stage3=100k, 합 165k) 도달 시
  단계를 강제 종료하고 그 시점 데이터로 다음 단계를 진행한다.
- 액션이 애매하면 실행하지 말고 사람에게 물어본다.
- 웹소켓에 의존하는 기능은 Playwright MCP의 네트워크 트래픽으로 식별하고
  테스트 후보에서 제외한다 (기록만 허용).`,
};
