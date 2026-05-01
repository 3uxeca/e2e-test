export type EnvName = 'local' | 'staging' | 'prod';

export type ActionAllowance =
  | 'free'
  | 'mock-only'
  | 'human-approval'
  | 'forbidden';

export interface GuardrailPolicy {
  env: EnvName;
  allowAdminAreaAccess: boolean;
  allowIrreversibleActions: ActionAllowance;
  allowPaymentOrExternalNotifications: ActionAllowance;
  maxRepeatedActions: number;
  ambiguousActionPolicy: 'block-and-ask';
  excludeWebsocketDependentFeatures: boolean;
  policyText: string;
}
