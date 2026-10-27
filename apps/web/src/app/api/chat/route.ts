import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { TurnEvent } from '@nexo/shared';
import { requireSession, services } from '@/server/context';
import { errorResponse, handle, readJson } from '@/server/http';
import { ServiceError } from '@/server/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Estado atual do chat do funcionário (conversa, mensagens e uso da sessão). */
export const GET = handle(async () => {
  const session = await requireSession('funcionario');
  return NextResponse.json(services().chat.state(session));
});

const SendSchema = z.object({ text: z.string() });

/**
 * Envia uma mensagem e devolve o turno do agent em Server-Sent Events:
 * passos (step_start/step_end), texto (text), cartões (block), decisão e o fim (done).
 * Se o cliente desconectar, o turno termina e é salvo mesmo assim.
 */
export async function POST(req: Request) {
  let session;
  let text: string;
  try {
    session = await requireSession('funcionario');
    text = SendSchema.parse(await readJson(req)).text;
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let open = true;
  const emit = (event: TurnEvent) => {
    if (!open) return;
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => {
      open = false;
    });
  };

  void (async () => {
    try {
      await services().chat.send(session, text, emit);
    } catch (err) {
      const message = err instanceof ServiceError ? err.message : 'Não consegui responder agora. Tente de novo em instantes.';
      if (!(err instanceof ServiceError)) console.error('[chat] erro', err);
      emit({ type: 'error', message, retryable: !(err instanceof ServiceError) || err.status >= 500 });
    } finally {
      open = false;
      writer.close().catch(() => undefined);
    }
  })();

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
