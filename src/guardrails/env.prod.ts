import type { GuardrailPolicy } from './types.js';

export const prodPolicy: GuardrailPolicy = {
  env: 'prod',
  allowAdminAreaAccess: false,
  allowIrreversibleActions: 'human-approval',
  allowPaymentOrExternalNotifications: 'forbidden',
  maxRepeatedActions: 5,
  ambiguousActionPolicy: 'block-and-ask',
  excludeWebsocketDependentFeatures: false,
  policyText: `[환경: prod (향후)]
- 도입 전 정책 확정 필요. 현재는 stub.`,
};
