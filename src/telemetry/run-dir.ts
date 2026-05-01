import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface RunDir {
  id: string;
  root: string;
  stagePath(stageId: string, fileName: string): string;
  metaPath(name: string): string;
}

export function createRunDir(rootBase = 'runs'): RunDir {
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const root = join(rootBase, id);
  mkdirSync(root, { recursive: true });

  return {
    id,
    root,
    stagePath(stageId, fileName) {
      const stageDir = join(root, stageId);
      mkdirSync(stageDir, { recursive: true });
      return join(stageDir, fileName);
    },
    metaPath(name) {
      return join(root, name);
    },
  };
}
