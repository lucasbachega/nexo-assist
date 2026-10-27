import { tokenize, type KbArticle, type KbSearchHit } from '@nexo/shared';

/**
 * Busca da central de ajuda: cobertura ponderada por IDF.
 * score = Σ idf(termos da busca presentes no artigo) / Σ idf(termos da busca).
 * Fica entre 0 e 1 e é fácil de explicar no painel de transparência.
 * Título e tags pesam o dobro do corpo.
 */
export class KbIndex {
  private readonly docs: Array<{ article: KbArticle; terms: Map<string, number> }>;
  private readonly idf = new Map<string, number>();

  constructor(articles: KbArticle[]) {
    this.docs = articles.map((article) => {
      const terms = new Map<string, number>();
      const add = (text: string, weight: number) => {
        for (const t of tokenize(text)) terms.set(t, Math.max(terms.get(t) ?? 0, weight));
      };
      add(article.body, 1);
      add(`${article.title} ${article.tags.join(' ')}`, 2);
      return { article, terms };
    });
    const df = new Map<string, number>();
    for (const d of this.docs) for (const t of d.terms.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    const n = this.docs.length;
    for (const [t, f] of df) this.idf.set(t, Math.log(1 + (n - f + 0.5) / (f + 0.5)));
  }

  search(query: string, limit = 3, minScore = 0.2): KbSearchHit[] {
    const q = [...new Set(tokenize(query))];
    if (q.length === 0) return [];
    const unknownIdf = Math.log(1 + this.docs.length);
    const total = q.reduce((s, t) => s + (this.idf.get(t) ?? unknownIdf), 0);
    return this.docs
      .map(({ article, terms }) => {
        let hit = 0;
        for (const t of q) {
          const w = terms.get(t);
          if (w) hit += (this.idf.get(t) ?? 0) * (w === 2 ? 1 : 0.75);
        }
        return { article, score: Math.round((hit / total) * 100) / 100 };
      })
      .filter((h) => h.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
