import { localPolicy } from './env.local.js';
import { stagingPolicy } from './env.staging.js';
import { prodPolicy } from './env.prod.js';
import type { EnvName, GuardrailPolicy } from './types.js';

export function selectGuardrailPolicy(env: EnvName): GuardrailPolicy {
  switch (env) {
    case 'local':
      return localPolicy;
    case 'staging':
      return stagingPolicy;
    case 'prod':
      return prodPolicy;
  }
}

export type { EnvName, GuardrailPolicy, ActionAllowance } from './types.js';
