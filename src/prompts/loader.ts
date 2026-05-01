import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

export function loadPromptTemplate(file: string): string {
  return readFileSync(join(PROMPTS_DIR, file), 'utf8');
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) {
      throw new Error(`prompt template missing var: ${key}`);
    }
    return vars[key]!;
  });
}
