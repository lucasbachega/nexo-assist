/**
 * Normalização e similaridade de texto em português, sem dependências.
 * Usada na busca da central de ajuda e na detecção de chamados duplicados.
 */

const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de da do das dos em no na nos nas por para pra pelo pela ' +
    'com sem e ou que se nao sim meu minha meus minhas seu sua seus suas ele ela eles elas ' +
    'eu voce voces nos isso esse essa este esta isto aquele aquela ao aos a as ja mais muito ' +
    'muita tem ter tenho estou esta estao foi ser sou era como quando onde qual quais ' +
    'desde ate depois antes hoje ontem agora aqui ai la tambem so mas porem entao preciso ' +
    'consigo consegue funciona funcionando problema aparece apareceu'
  ).split(/\s+/),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stem simplificado: corta plurais e sufixos verbais mais comuns. */
function stem(token: string): string {
  if (/^\d+$/.test(token)) return token;
  return token
    .replace(/(coes|soes)$/, 'cao')
    .replace(/(mente|ando|endo|indo|ado|ada|idos|idas|ido|ida)$/, '')
    .replace(/(es|s)$/, '');
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem)
    .filter((t) => t.length > 1);
}

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

/** Fração dos termos de `query` que aparecem em `doc` (cobertura). */
export function coverage(query: string[], doc: string[]): number {
  const q = new Set(query);
  if (q.size === 0) return 0;
  const d = new Set(doc);
  let hit = 0;
  for (const t of q) if (d.has(t)) hit += 1;
  return hit / q.size;
}
