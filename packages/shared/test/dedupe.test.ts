import { describe, expect, it } from 'vitest';
import { canReopen, findDuplicateCandidates, type Ticket } from '../src';

const now = new Date('2026-10-27T13:35:00Z');
const ticket = (t: Partial<Ticket>): Ticket => ({
  id: 'INC-1',
  type: 'INC',
  title: 'Notebook lento após atualização do Windows',
  description: 'Lentidão geral desde a atualização de 15/10.',
  category: 'Hardware',
  priority: 'media',
  status: 'aguardando_analista',
  affected: 'somente_voce',
  requesterId: 'u1',
  assignedQueue: null,
  assignedTo: null,
  createdAt: '2026-10-16T17:20:00Z',
  updatedAt: '2026-10-21T17:20:00Z',
  lastSupportUpdateAt: '2026-10-21T17:20:00Z',
  resolvedAt: null,
  ...t,
});

describe('detecção de duplicidade', () => {
  it('reconhece o mesmo problema descrito com outras palavras', () => {
    const c = findDuplicateCandidates(
      { title: 'Notebook muito lento', description: 'Meu notebook ficou lento depois da atualização do Windows', category: 'Hardware' },
      [ticket({})],
      now,
    );
    expect(c[0]?.strength).toBe('forte');
    expect(c[0]?.action).toBe('atualizar');
  });

  it('não confunde problemas diferentes', () => {
    const c = findDuplicateCandidates(
      { title: 'VPN não conecta — erro 809', description: 'A VPN mostra erro 809 desde ontem', category: 'Rede e VPN' },
      [ticket({})],
      now,
    );
    expect(c).toHaveLength(0);
  });

  it('sugere reabrir chamado resolvido há até 7 dias, e não um mais antigo', () => {
    const sap = ticket({ id: 'INC-20150', title: 'Senha do SAP bloqueada', description: 'Senha do SAP bloqueada após tentativas', category: 'Acesso', status: 'resolvido', resolvedAt: '2026-10-23T12:00:00Z' });
    const draft = { title: 'SAP bloqueou minha senha de novo', description: 'A senha do SAP bloqueou outra vez', category: 'Acesso' as const };
    expect(findDuplicateCandidates(draft, [sap], now)[0]?.action).toBe('reabrir');
    const old = { ...sap, resolvedAt: '2026-10-10T12:00:00Z' };
    expect(canReopen(old, now)).toBe(false);
    expect(findDuplicateCandidates(draft, [old], now)).toHaveLength(0);
  });
});
