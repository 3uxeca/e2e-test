import { appendFileSync, writeFileSync } from 'node:fs';

export type DecisionCategory =
  | 'orchestrator-start'
  | 'orchestrator-end'
  | 'start'
  | 'end'
  | 'choice'
  | 'observation'
  | 'token-limit'
  | 'note'
  | 'error';

export interface DecisionEntry {
  ts: string;
  stageId?: string;
  category: DecisionCategory;
  message: string;
  data?: unknown;
}

export class DecisionLogger {
  constructor(private readonly path: string) {
    writeFileSync(this.path, '', 'utf8');
  }

  log(entry: Omit<DecisionEntry, 'ts'>): void {
    const full: DecisionEntry = { ts: new Date().toISOString(), ...entry };
    appendFileSync(this.path, JSON.stringify(full) + '\n', 'utf8');
  }
}
