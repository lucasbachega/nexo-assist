import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ServiceError } from './services';

/** Envolve um handler de rota convertendo erros em JSON com status adequado. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ServiceError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: err.issues[0]?.message ?? 'Dados inválidos', code: 'validacao' }, { status: 400 });
  }
  console.error('[api] erro inesperado', err);
  return NextResponse.json({ error: 'Erro inesperado. Tente de novo.', code: 'interno' }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ServiceError(400, 'Corpo da requisição inválido');
  }
}
