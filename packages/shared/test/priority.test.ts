import { describe, expect, it } from 'vitest';
import { classifyPriority, type PriorityFacts } from '../src';

const facts = (f: Partial<PriorityFacts>): PriorityFacts => ({
  affected: 'somente_voce',
  workStopped: false,
  hasWorkaround: true,
  sameDayCommitment: false,
  ...f,
});

describe('matriz de prioridade (Anexo A)', () => {
  it('parado para a equipe ou empresa → Crítica', () => {
    expect(classifyPriority('INC', facts({ affected: 'equipe', workStopped: true })).priority).toBe('critica');
    expect(classifyPriority('INC', facts({ affected: 'empresa', workStopped: true })).priority).toBe('critica');
  });

  it('afeta a equipe mas não parou → Alta', () => {
    expect(classifyPriority('INC', facts({ affected: 'equipe' })).priority).toBe('alta');
  });

  it('compromisso no mesmo dia → Alta (VPN antes da reunião das 14h)', () => {
    const d = classifyPriority('INC', facts({ sameDayCommitment: true, workStopped: true }));
    expect(d.priority).toBe('alta');
    expect(d.rule).toMatch(/mesmo dia/);
  });

  it('impede uma pessoa de trabalhar sem alternativa → Alta', () => {
    expect(classifyPriority('INC', facts({ workStopped: true, hasWorkaround: false })).priority).toBe('alta');
  });

  it('atrapalha mas há alternativa → Média', () => {
    expect(classifyPriority('INC', facts({})).priority).toBe('media');
  });

  it('pedido sem urgência → Baixa', () => {
    expect(classifyPriority('REQ', facts({})).priority).toBe('baixa');
  });

  it('pedido que impede de trabalhar segue a regra de impacto', () => {
    expect(classifyPriority('REQ', facts({ workStopped: true, hasWorkaround: false })).priority).toBe('alta');
  });
});
