import { PRIORITY_LABEL, STATUS_LABEL, type ChatMessage, type UiBlock } from '@nexo/shared';

export type ModelMessage = { role: 'user'; content: string } | { role: 'assistant'; content: string };

/**
 * Resumo textual dos cartões exibidos, para o modelo manter o contexto sem
 * receber o JSON completo das ferramentas de turnos anteriores (economia de tokens).
 */
export function summarizeBlock(b: UiBlock): string {
  switch (b.type) {
    case 'ticket_list':
      return `[mostrei a lista de chamados abertos: ${b.tickets.map((t) => `${t.id} (${t.title})`).join('; ')}]`;
    case 'ticket_card':
      return `[mostrei o cartão do ${b.ticket.id}: ${STATUS_LABEL[b.ticket.status]}, prioridade ${PRIORITY_LABEL[b.ticket.priority]}, ${b.ticket.sla.summary}]`;
    case 'draft': {
      const d = b.draft;
      const what =
        d.payload.kind === 'criar'
          ? `novo chamado "${d.payload.title}", ${d.payload.category}, prioridade ${PRIORITY_LABEL[d.payload.priority]}`
          : `${d.payload.kind} ${d.payload.ticketId}: "${d.payload.comment ?? ''}"`;
      const status =
        d.status === 'confirmado'
          ? `confirmado${d.resultTicketId ? ` → ${d.resultTicketId}` : ''}`
          : d.status === 'pendente'
            ? 'aguardando confirmação'
            : d.status;
      return `[rascunho ${d.id} — ${what} — ${status}]`;
    }
    case 'quick_replies':
      return `[ofereci as opções: ${b.options.join(' | ')}]`;
    case 'kb_article':
      return `[citei o artigo ${b.id} "${b.title}"${b.applicable ? '' : ' (não se aplica ao equipamento dele)'}]`;
    case 'handoff':
      return `[transferi para ${b.queue}]`;
  }
}

function render(m: ChatMessage): ModelMessage {
  switch (m.role) {
    case 'user':
      return { role: 'user', content: m.text };
    case 'assistant':
      return { role: 'assistant', content: [m.text, ...m.blocks.map(summarizeBlock)].filter(Boolean).join('\n') };
    case 'analyst':
      return { role: 'assistant', content: `[Analista ${m.authorName ?? ''}]: ${m.text}` };
    case 'system':
      return { role: 'assistant', content: `[Sistema] ${m.text}` };
  }
}

/**
 * Converte o histórico persistido em mensagens para o modelo:
 * janela das últimas N mensagens, papéis consecutivos agrupados e
 * começando sempre por uma mensagem do funcionário.
 */
export function toModelMessages(history: ChatMessage[], userMessage: string, window = 16): ModelMessage[] {
  const recent = history.slice(-window).map(render);
  recent.push({ role: 'user', content: userMessage });
  const merged: ModelMessage[] = [];
  for (const m of recent) {
    if (!m.content.trim()) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else merged.push({ ...m });
  }
  // A API exige que a conversa comece pelo usuário; preservamos o contexto anterior.
  if (merged[0]?.role === 'assistant') merged.unshift({ role: 'user', content: '(continuação de uma conversa anterior)' });
  return merged;
}
