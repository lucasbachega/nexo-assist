import type { Decision, TraceStep, TurnEvent, UiBlock } from '@nexo/shared';
import type { AttemptInfo } from '@nexo/tickets/client';

export type Emit = (event: TurnEvent) => void;

export interface StepContext {
  /** Acrescenta uma linha legível ao detalhe do passo. */
  detail(line: string): void;
  /** Observador de tentativas do sistema de chamados (conta retries). */
  onAttempt(info: AttemptInfo): void;
}

/**
 * Registra o que o agent faz num turno: cada passo (com rótulo no passado,
 * duração, tentativas e detalhes), os blocos de interface e a decisão.
 * Tudo é emitido em tempo real para a interface e guardado na mensagem.
 */
export class TurnTracer {
  readonly steps: TraceStep[] = [];
  readonly blocks: UiBlock[] = [];
  decision: Decision | null = null;
  private seq = 0;

  constructor(private readonly emit: Emit) {}

  async step<T>(label: string, tool: string, fn: (ctx: StepContext) => Promise<T>, opts: { silent?: boolean } = {}): Promise<T> {
    const id = `s${(this.seq += 1)}`;
    const startedAt = new Date();
    const details: string[] = [];
    let attempts = 0;
    if (!opts.silent) this.emit({ type: 'step_start', id, label });
    const finish = (status: TraceStep['status']) => {
      const step: TraceStep = {
        id,
        label,
        tool,
        status,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        attempts,
        details,
        silent: Boolean(opts.silent),
      };
      this.steps.push(step);
      this.emit({ type: 'step_end', step });
    };
    try {
      const result = await fn({
        detail: (line) => details.push(line),
        onAttempt: (info) => {
          attempts += 1;
          if (!info.ok) details.push(`Tentativa ${info.attempt} falhou (${info.error ?? info.status}); tentando de novo`);
        },
      });
      finish('ok');
      return result;
    } catch (err) {
      details.push(err instanceof Error ? err.message : String(err));
      finish('erro');
      throw err;
    }
  }

  /** Registra um passo instantâneo (ex.: "calculou o prazo") já concluído. */
  note(label: string, tool: string, details: string[]): void {
    const id = `s${(this.seq += 1)}`;
    const step: TraceStep = {
      id,
      label,
      tool,
      status: 'ok',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      attempts: 0,
      details,
      silent: false,
    };
    this.emit({ type: 'step_start', id, label });
    this.steps.push(step);
    this.emit({ type: 'step_end', step });
  }

  addBlock(block: UiBlock): void {
    // Um bloco por tipo e por entidade: o mais recente substitui o anterior.
    const key = blockKey(block);
    const idx = this.blocks.findIndex((b) => blockKey(b) === key);
    if (idx >= 0) this.blocks.splice(idx, 1);
    this.blocks.push(block);
    this.emit({ type: 'block', block });
  }

  setDecision(decision: Decision): void {
    this.decision = decision;
    this.emit({ type: 'decision', decision });
  }
}

function blockKey(b: UiBlock): string {
  switch (b.type) {
    case 'ticket_card':
      return `card:${b.ticket.id}`;
    case 'draft':
      return `draft:${b.draft.id}`;
    case 'kb_article':
      return `kb:${b.id}`;
    default:
      return b.type;
  }
}
