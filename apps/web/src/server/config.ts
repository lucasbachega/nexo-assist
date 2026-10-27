import 'server-only';

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

/** Configuração do app lida do ambiente (um .env na raiz do monorepo). */
export const config = {
  model: process.env.MODEL || 'anthropic/claude-haiku-4-5',
  ticketsUrl: process.env.TICKETS_SERVICE_URL || 'http://localhost:4000',
  ticketsToken: process.env.TICKETS_SERVICE_TOKEN || '',
  maxMessagesPerSession: num(process.env.MAX_MESSAGES_PER_SESSION, 30),
  maxMessagesPerHour: num(process.env.MAX_MESSAGES_PER_HOUR, 60),
  maxMessagesPerDayGlobal: num(process.env.MAX_MESSAGES_PER_DAY_GLOBAL, 0),
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 12),
  secureCookies: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true',
};

export function missingModelKey(): string | null {
  const provider = config.model.split('/')[0]?.toLowerCase();
  const envByProvider: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };
  const key = provider ? envByProvider[provider] : undefined;
  if (key && !process.env[key]) return key;
  return null;
}
