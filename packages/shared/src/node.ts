import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Sobe a árvore até achar o package.json com "workspaces" (raiz do monorepo). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, 'utf8')) as { workspaces?: unknown };
        if (json.workspaces) return dir;
      } catch {
        /* ignora package.json inválido */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

/** Pasta de dados (SQLite). Configurável por DATA_DIR; padrão: <raiz>/data. */
export function resolveDataDir(): string {
  const configured = process.env.DATA_DIR;
  const root = findRepoRoot();
  const dir = configured ? path.resolve(root, configured) : path.join(root, 'data');
  mkdirSync(dir, { recursive: true });
  return dir;
}
