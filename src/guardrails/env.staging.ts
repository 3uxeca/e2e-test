import type { GuardrailPolicy } from './types.js';

export const stagingPolicy: GuardrailPolicy = {
  env: 'staging',
  allowAdminAreaAccess: true,
  allowIrreversibleActions: 'free',
  allowPaymentOrExternalNotifications: 'human-approval',
  maxRepeatedActions: 5,
  ambiguousActionPolicy: 'block-and-ask',
  excludeWebsocketDependentFeatures: false,
  policyText: `[환경: staging (3주차 예정)]
- 3주차 도입 전 정책 확정 필요. 현재는 stub.`,
};
