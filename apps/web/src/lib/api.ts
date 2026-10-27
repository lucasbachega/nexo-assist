import type { TurnEvent } from '@nexo/shared';

/** Sessão expirada: recarrega a página de login do zero (limpa o estado do cliente). */
function redirectToLogin() {
  window.location.replace('/login?expirada=1');
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** fetch JSON com mensagens de erro amigáveis vindas da API. */
export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão. Verifique sua internet e tente de novo.');
  }
  if (res.status === 401 && !url.includes('/auth/')) redirectToLogin();
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Algo deu errado. Tente de novo.', data.code);
  return data as T;
}

/** Envia a mensagem e lê o turno do agent como Server-Sent Events. */
export async function streamChat(text: string, onEvent: (e: TurnEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão. Verifique sua internet e tente de novo.');
  }
  if (res.status === 401) {
    redirectToLogin();
    return;
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? 'Não consegui enviar. Tente de novo.');
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) onEvent(JSON.parse(line.slice(6)) as TurnEvent);
    }
  }
}
