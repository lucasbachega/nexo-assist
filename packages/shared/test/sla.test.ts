import { describe, expect, it } from 'vitest';
import { addBusinessDays, addBusinessMinutes, computeDeadline, computeSlaStatus, formatTime, formatDateTime } from '../src';

/** Cria um instante a partir do horário local de São Paulo (UTC−3). */
const sp = (local: string) => new Date(`${local}-03:00`);

describe('prazos em horário útil', () => {
  it('Alta: 4 horas úteis no mesmo dia (09:43 → 13:43, como no protótipo)', () => {
    const d = computeDeadline(sp('2026-10-27T09:43:00'), 'alta');
    expect(formatTime(d)).toBe('13:43');
  });

  it('Alta: atravessa o fim do expediente para o dia seguinte', () => {
    const d = addBusinessMinutes(sp('2026-10-27T16:00:00'), 240);
    expect(formatDateTime(d)).toBe('28 out, 10:00');
  });

  it('Alta: sexta à tarde vence na segunda', () => {
    const d = addBusinessMinutes(sp('2026-10-23T17:00:00'), 240);
    expect(formatDateTime(d)).toBe('26 out, 11:00');
  });

  it('fora do expediente, o relógio começa na próxima abertura', () => {
    expect(formatDateTime(addBusinessMinutes(sp('2026-10-24T10:00:00'), 60))).toBe('26 out, 09:00'); // sábado
    expect(formatDateTime(addBusinessMinutes(sp('2026-10-27T06:30:00'), 60))).toBe('27 out, 09:00');
    expect(formatDateTime(addBusinessMinutes(sp('2026-10-27T19:00:00'), 60))).toBe('28 out, 09:00');
  });

  it('Média: 3 dias úteis pulando o fim de semana', () => {
    expect(formatDateTime(addBusinessDays(sp('2026-10-16T14:20:00'), 3))).toBe('21 out, 14:20');
  });

  it('Crítica: 1 hora corrida (plantão 24h), inclusive de madrugada', () => {
    const d = computeDeadline(sp('2026-10-25T02:10:00'), 'critica');
    expect(formatDateTime(d)).toBe('25 out, 03:10');
  });
});

describe('status do prazo', () => {
  const now = sp('2026-10-27T10:35:00');

  it('marca vencido quando a última atualização passou do prazo', () => {
    const s = computeSlaStatus(
      { priority: 'media', status: 'aguardando_analista', lastSupportUpdateAt: sp('2026-10-21T14:20:00').toISOString() },
      now,
    );
    expect(s.overdue).toBe(true);
    expect(s.summary).toBe('prazo vencido');
    expect(s.sinceLastUpdate).toBe('há 5 dias');
  });

  it('dentro do prazo mostra o horário limite', () => {
    const s = computeSlaStatus(
      { priority: 'alta', status: 'aberto', lastSupportUpdateAt: sp('2026-10-27T09:43:00').toISOString() },
      now,
    );
    expect(s.overdue).toBe(false);
    expect(s.summary).toBe('resposta até 13:43');
  });

  it('não corre prazo quando aguarda o funcionário ou está resolvido', () => {
    const base = { priority: 'alta' as const, lastSupportUpdateAt: sp('2026-10-01T09:00:00').toISOString() };
    expect(computeSlaStatus({ ...base, status: 'aguardando_usuario' }, now).state).toBe('paused');
    expect(computeSlaStatus({ ...base, status: 'resolvido' }, now).overdue).toBe(false);
  });
});
