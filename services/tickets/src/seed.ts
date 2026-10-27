import type { Employee, KbArticle, Ticket, TicketEvent } from '@nexo/shared';
import { toLocalWall, fromLocalWall } from '@nexo/shared';
import type { Db } from './db';

/**
 * Dados de exemplo (Anexo B). As datas são relativas ao momento do seed para que
 * os cenários (chamado vencido, resolvido há 4 dias etc.) funcionem em qualquer dia.
 */

/** Dia útil N dias atrás, no horário local informado. */
function daysAgo(now: Date, days: number, hh: number, mm = 0): string {
  const wall = toLocalWall(new Date(now.getTime() - days * 86_400_000));
  wall.setUTCHours(hh, mm, 0, 0);
  return fromLocalWall(wall).toISOString();
}

/** N dias úteis atrás (pula sábado e domingo), no horário local informado. */
function businessDaysAgo(now: Date, days: number, hh: number, mm = 0): string {
  let wall = toLocalWall(now);
  let left = days;
  while (left > 0) {
    wall = new Date(wall.getTime() - 86_400_000);
    if (wall.getUTCDay() !== 0 && wall.getUTCDay() !== 6) left -= 1;
  }
  wall.setUTCHours(hh, mm, 0, 0);
  return fromLocalWall(wall).toISOString();
}

export const EMPLOYEES: Employee[] = [
  {
    id: 'emp-ana',
    name: 'Ana Souza',
    email: 'ana.souza@nexo.com.br',
    role: 'funcionario',
    department: 'Financeiro',
    device: 'Notebook Dell Latitude 5440',
    os: 'Windows 11',
    team: null,
  },
  {
    id: 'emp-carla',
    name: 'Carla Mendes',
    email: 'carla.mendes@nexo.com.br',
    role: 'funcionario',
    department: 'Comercial',
    device: 'Notebook Lenovo ThinkPad E14',
    os: 'Windows 10',
    team: null,
  },
  {
    id: 'emp-bruno',
    name: 'Bruno Tavares',
    email: 'bruno.tavares@nexo.com.br',
    role: 'funcionario',
    department: 'Marketing',
    device: 'MacBook Pro 14"',
    os: 'macOS 15',
    team: null,
  },
  {
    id: 'emp-diego',
    name: 'Diego Ramos',
    email: 'diego.ramos@nexo.com.br',
    role: 'funcionario',
    department: 'Jurídico',
    device: 'Notebook Dell Latitude 5440',
    os: 'Windows 11',
    team: null,
  },
  {
    id: 'emp-elisa',
    name: 'Elisa Prado',
    email: 'elisa.prado@nexo.com.br',
    role: 'funcionario',
    department: 'Pessoas (RH)',
    device: 'Notebook Dell Latitude 5440',
    os: 'Windows 11',
    team: null,
  },
  {
    id: 'emp-fabio',
    name: 'Fábio Nunes',
    email: 'fabio.nunes@nexo.com.br',
    role: 'funcionario',
    department: 'Operações',
    device: 'Desktop HP EliteDesk',
    os: 'Windows 10',
    team: null,
  },
  {
    id: 'emp-gabriela',
    name: 'Gabriela Rocha',
    email: 'gabriela.rocha@nexo.com.br',
    role: 'funcionario',
    department: 'Comercial',
    device: 'Notebook Lenovo ThinkPad E14',
    os: 'Windows 11',
    team: null,
  },
  {
    id: 'ana-rafael',
    name: 'Rafael Lima',
    email: 'rafael.lima@nexo.com.br',
    role: 'analista',
    department: 'TI',
    device: null,
    os: null,
    team: 'Suporte N2',
  },
  {
    id: 'ana-juliana',
    name: 'Juliana Costa',
    email: 'juliana.costa@nexo.com.br',
    role: 'analista',
    department: 'TI',
    device: null,
    os: null,
    team: 'Suporte N1',
  },
];

export function buildArticles(now: Date): KbArticle[] {
  const at = daysAgo(now, 30, 10);
  return [
    {
      id: 'KB-001',
      title: 'VPN com erro 809',
      category: 'Rede e VPN',
      tags: ['vpn', 'erro 809', 'conexao remota', 'nao conecta'],
      appliesToOs: ['Windows 10'],
      updatedAt: at,
      body: 'Reinstale o cliente de VPN pelo portal de softwares (portal.nexo.com.br/softwares) e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.',
    },
    {
      id: 'KB-002',
      title: 'Horário do service desk',
      category: 'Outros',
      tags: ['horario', 'atendimento', 'plantao', 'expediente'],
      appliesToOs: [],
      updatedAt: at,
      body: 'De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas. Fora do horário, o Nexo Assist registra o chamado e o prazo começa a contar na próxima abertura.',
    },
    {
      id: 'KB-003',
      title: 'Como redefinir a senha da rede',
      category: 'Acesso',
      tags: ['senha', 'redefinir', 'esqueci a senha', 'bloqueio', 'conta bloqueada', 'rede'],
      appliesToOs: [],
      updatedAt: at,
      body: 'Em Meu perfil > Redefinir senha, você recebe um link no e-mail corporativo. A senha expira a cada 90 dias e precisa ter 12 caracteres. Se a conta bloquear após 5 tentativas erradas, ela libera sozinha em 15 minutos.',
    },
    {
      id: 'KB-004',
      title: 'Configurar o e-mail corporativo no celular',
      category: 'E-mail',
      tags: ['outlook', 'celular', 'email', 'sincronizar', 'mfa'],
      appliesToOs: [],
      updatedAt: at,
      body: 'Instale o app Outlook, entre com o e-mail corporativo e aprove o login no Microsoft Authenticator. Se parar de sincronizar, remova a conta do app e adicione de novo. Apps de e-mail nativos não são suportados.',
    },
    {
      id: 'KB-005',
      title: 'Acesso a pastas do SharePoint',
      category: 'Acesso',
      tags: ['sharepoint', 'pasta', 'permissao', 'acesso negado', 'compartilhamento'],
      appliesToOs: [],
      updatedAt: at,
      body: 'Acesso a pastas de outra área é uma requisição e precisa da aprovação do gestor da pasta. Abra a requisição pelo Nexo Assist informando a pasta e o motivo; após a aprovação, o acesso é liberado em até 1 dia útil.',
    },
    {
      id: 'KB-006',
      title: 'Instalar software pelo portal de softwares',
      category: 'Software',
      tags: ['instalar', 'programa', 'software', 'portal', 'licenca'],
      appliesToOs: [],
      updatedAt: at,
      body: 'Softwares homologados são instalados pelo portal de softwares (portal.nexo.com.br/softwares) sem chamado. Se o software não estiver no portal ou precisar de licença paga, abra uma requisição.',
    },
    {
      id: 'KB-007',
      title: 'Wi-Fi para visitantes',
      category: 'Rede e VPN',
      tags: ['wifi', 'wi-fi', 'visitante', 'senha do wifi', 'rede sem fio'],
      appliesToOs: [],
      updatedAt: at,
      body: 'Visitantes usam a rede Nexo-Visitantes. A senha muda toda segunda-feira e fica com a recepção. Funcionários usam a rede Nexo-Corp com o login da rede.',
    },
    {
      id: 'KB-008',
      title: 'Teams sem áudio nas chamadas',
      category: 'Software',
      tags: ['teams', 'audio', 'microfone', 'fone', 'reuniao', 'som'],
      appliesToOs: [],
      updatedAt: at,
      body: 'Em Configurações > Dispositivos do Teams, escolha o fone correto. Feche o Teams pela bandeja do sistema e abra de novo. Se continuar sem áudio, teste o fone em outro app; se funcionar fora do Teams, abra um chamado.',
    },
    {
      id: 'KB-009',
      title: 'Computador lento: o que verificar',
      category: 'Hardware',
      tags: ['lento', 'lentidao', 'travando', 'desempenho', 'notebook'],
      appliesToOs: [],
      updatedAt: at,
      body: 'Reinicie o computador (não apenas suspenda), rode o Nexo Diagnóstico pela central e libere espaço se o disco estiver acima de 90%. Se continuar lento depois disso, abra um chamado informando quando começou.',
    },
    {
      id: 'KB-010',
      title: 'Adicionar uma impressora',
      category: 'Hardware',
      tags: ['impressora', 'imprimir', 'impressao', 'scanner'],
      appliesToOs: [],
      updatedAt: at,
      body: 'No Windows, abra Impressoras e scanners > Adicionar e escolha a impressora do seu andar (\\\\print01\\andarX). Se a impressora não aparece ou fica com documentos presos na fila, abra um chamado.',
    },
  ];
}

type SeedTicket = Omit<Ticket, 'assignedTo'> & {
  assignedTo?: string | null;
  events?: Array<Pick<TicketEvent, 'at' | 'author' | 'authorName' | 'kind' | 'text'>>;
};

export function buildTickets(now: Date): SeedTicket[] {
  const t = (x: SeedTicket) => x;
  return [
    // Ana — chamado vencido (prioridade média, sem atualização da TI há 6 dias)
    t({
      id: 'INC-20311',
      type: 'INC',
      title: 'Notebook lento após atualização do Windows',
      category: 'Hardware',
      priority: 'media',
      status: 'aguardando_analista',
      affected: 'somente_voce',
      requesterId: 'emp-ana',
      description: 'Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.',
      assignedQueue: 'Suporte N1',
      createdAt: daysAgo(now, 11, 14, 20),
      updatedAt: daysAgo(now, 6, 14, 20),
      lastSupportUpdateAt: daysAgo(now, 6, 14, 20),
      resolvedAt: null,
      events: [
        {
          at: daysAgo(now, 6, 14, 20),
          author: 'analista',
          authorName: 'Juliana Costa',
          kind: 'comentario',
          text: 'Coletamos os logs remotamente, vamos analisar o driver de vídeo.',
        },
      ],
    }),
    t({
      id: 'INC-20298',
      type: 'INC',
      title: 'Acesso à pasta Financeiro no SharePoint',
      category: 'Acesso',
      priority: 'media',
      status: 'em_andamento',
      affected: 'somente_voce',
      requesterId: 'emp-ana',
      description: 'Aparece "acesso negado" ao abrir a pasta Financeiro/Fechamento no SharePoint desde a migração.',
      assignedQueue: 'Suporte N1',
      createdAt: daysAgo(now, 13, 9, 10),
      updatedAt: businessDaysAgo(now, 1, 16, 0),
      lastSupportUpdateAt: businessDaysAgo(now, 1, 16, 0),
      resolvedAt: null,
    }),
    t({
      id: 'REQ-10442',
      type: 'REQ',
      title: 'Segundo monitor para home office',
      category: 'Hardware',
      priority: 'baixa',
      status: 'aprovado',
      affected: 'somente_voce',
      requesterId: 'emp-ana',
      description: 'Solicito um segundo monitor de 24" para o home office. Aprovado pelo gestor.',
      assignedQueue: 'Suporte N1',
      createdAt: daysAgo(now, 18, 11, 0),
      updatedAt: businessDaysAgo(now, 2, 10, 0),
      lastSupportUpdateAt: businessDaysAgo(now, 2, 10, 0),
      resolvedAt: null,
    }),
    // Ana — resolvido há 4 dias (pode ser reaberto)
    t({
      id: 'INC-20150',
      type: 'INC',
      title: 'Senha do SAP bloqueada',
      category: 'Acesso',
      priority: 'media',
      status: 'resolvido',
      affected: 'somente_voce',
      requesterId: 'emp-ana',
      description: 'Senha do SAP bloqueada após tentativas de login.',
      assignedQueue: 'Suporte N1',
      createdAt: daysAgo(now, 5, 9, 0),
      updatedAt: daysAgo(now, 4, 11, 0),
      lastSupportUpdateAt: daysAgo(now, 4, 11, 0),
      resolvedAt: daysAgo(now, 4, 11, 0),
    }),
    t({
      id: 'INC-19877',
      type: 'INC',
      title: 'Outlook não sincroniza no celular',
      category: 'E-mail',
      priority: 'media',
      status: 'resolvido',
      affected: 'somente_voce',
      requesterId: 'emp-ana',
      description: 'Outlook do celular parou de receber e-mails.',
      assignedQueue: 'Suporte N1',
      createdAt: daysAgo(now, 57, 9, 0),
      updatedAt: daysAgo(now, 55, 15, 0),
      lastSupportUpdateAt: daysAgo(now, 55, 15, 0),
      resolvedAt: daysAgo(now, 55, 15, 0),
    }),
    t({
      id: 'INC-19410',
      type: 'INC',
      title: 'Troca de senha da rede',
      category: 'Acesso',
      priority: 'baixa',
      status: 'fechado',
      affected: 'somente_voce',
      requesterId: 'emp-ana',
      description: 'Não consegui trocar a senha expirada.',
      assignedQueue: 'Suporte N1',
      createdAt: daysAgo(now, 109, 9, 0),
      updatedAt: daysAgo(now, 108, 15, 0),
      lastSupportUpdateAt: daysAgo(now, 108, 15, 0),
      resolvedAt: daysAgo(now, 108, 15, 0),
    }),
    // Outros funcionários (testam a privacidade: Ana nunca deve vê-los)
    t({
      id: 'REQ-10460',
      type: 'REQ',
      title: 'Acesso ao SAP — módulo de vendas',
      category: 'Acesso',
      priority: 'alta',
      status: 'aberto',
      affected: 'somente_voce',
      requesterId: 'emp-carla',
      description: 'Preciso de acesso ao módulo de vendas do SAP ainda hoje para lançar os pedidos do mês.',
      assignedQueue: 'Suporte N1',
      createdAt: daysAgo(now, 0, 9, 50),
      updatedAt: daysAgo(now, 0, 9, 50),
      lastSupportUpdateAt: daysAgo(now, 0, 9, 50),
      resolvedAt: null,
    }),
    t({
      id: 'INC-20330',
      type: 'INC',
      title: 'Impressora do 3º andar não imprime',
      category: 'Hardware',
      priority: 'media',
      status: 'em_andamento',
      affected: 'equipe',
      requesterId: 'emp-carla',
      description: 'Os documentos ficam presos na fila da impressora do 3º andar. Estamos usando a do 2º andar.',
      assignedQueue: 'Suporte N1',
      createdAt: businessDaysAgo(now, 1, 15, 0),
      updatedAt: businessDaysAgo(now, 1, 15, 30),
      lastSupportUpdateAt: businessDaysAgo(now, 1, 15, 30),
      resolvedAt: null,
    }),
    t({
      id: 'INC-20325',
      type: 'INC',
      title: 'Adobe Creative Cloud não abre',
      category: 'Software',
      priority: 'media',
      status: 'aberto',
      affected: 'somente_voce',
      requesterId: 'emp-bruno',
      description: 'O Creative Cloud fecha logo depois de abrir, desde ontem.',
      assignedQueue: null,
      createdAt: businessDaysAgo(now, 1, 11, 0),
      updatedAt: businessDaysAgo(now, 1, 11, 0),
      lastSupportUpdateAt: businessDaysAgo(now, 1, 11, 0),
      resolvedAt: null,
    }),
    t({
      id: 'INC-20519',
      type: 'INC',
      title: 'Teams sem áudio nas reuniões',
      category: 'Software',
      priority: 'media',
      status: 'aberto',
      affected: 'somente_voce',
      requesterId: 'emp-elisa',
      description: 'Ninguém me escuta nas reuniões do Teams. O fone funciona em outros apps.',
      assignedQueue: null,
      createdAt: daysAgo(now, 0, 10, 3),
      updatedAt: daysAgo(now, 0, 10, 3),
      lastSupportUpdateAt: daysAgo(now, 0, 10, 3),
      resolvedAt: null,
    }),
  ];
}

export function seed(db: Db, now: Date = new Date()): void {
  db.transaction(() => {
    const insEmp = db.prepare(
      'INSERT INTO employees (id, name, email, role, department, device, os, team) VALUES (@id, @name, @email, @role, @department, @device, @os, @team)',
    );
    for (const e of EMPLOYEES) insEmp.run(e);

    const insKb = db.prepare(
      'INSERT INTO kb_articles (id, title, body, category, tags, applies_to_os, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const a of buildArticles(now))
      insKb.run(a.id, a.title, a.body, a.category, JSON.stringify(a.tags), JSON.stringify(a.appliesToOs), a.updatedAt);

    const insTicket = db.prepare(
      `INSERT INTO tickets (id, type, title, description, category, priority, status, affected, requester_id, assigned_queue,
        assigned_to, created_at, updated_at, last_support_update_at, resolved_at)
       VALUES (@id, @type, @title, @description, @category, @priority, @status, @affected, @requesterId, @assignedQueue,
        @assignedTo, @createdAt, @updatedAt, @lastSupportUpdateAt, @resolvedAt)`,
    );
    const insEvent = db.prepare('INSERT INTO ticket_events (ticket_id, at, author, author_name, kind, text) VALUES (?, ?, ?, ?, ?, ?)');
    for (const { events, ...ticket } of buildTickets(now)) {
      insTicket.run({ ...ticket, assignedTo: ticket.assignedTo ?? null });
      insEvent.run(ticket.id, ticket.createdAt, 'funcionario', null, 'criado', 'Chamado aberto');
      for (const ev of events ?? []) insEvent.run(ticket.id, ev.at, ev.author, ev.authorName, ev.kind, ev.text);
      if (ticket.resolvedAt) insEvent.run(ticket.id, ticket.resolvedAt, 'analista', 'Juliana Costa', 'status', 'Chamado resolvido');
    }
    const seq = db.prepare('INSERT OR REPLACE INTO sequences (type, next_value) VALUES (?, ?)');
    seq.run('INC', 20520);
    seq.run('REQ', 10461);
  })();
}
