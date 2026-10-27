import { z } from 'zod';

/**
 * Domínio do service desk (Anexo A do PRD).
 * Tudo que é regra de negócio fica aqui em código, e não no prompt: o modelo
 * descreve fatos (quem é afetado, se há compromisso hoje), o código decide.
 */

export const TICKET_TYPES = ['INC', 'REQ'] as const;
export const TicketTypeSchema = z.enum(TICKET_TYPES);
export type TicketType = z.infer<typeof TicketTypeSchema>;

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  INC: 'Incidente',
  REQ: 'Requisição',
};

export const CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const PRIORITIES = ['critica', 'alta', 'media', 'baixa'] as const;
export const PrioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof PrioritySchema>;

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

/** Quem é afetado — o "impacto" da matriz de prioridade. */
export const AFFECTED = ['somente_voce', 'equipe', 'empresa'] as const;
export const AffectedSchema = z.enum(AFFECTED);
export type Affected = z.infer<typeof AffectedSchema>;

export const AFFECTED_LABEL: Record<Affected, string> = {
  somente_voce: 'Somente você',
  equipe: 'A equipe',
  empresa: 'Toda a empresa',
};

export const TICKET_STATUSES = [
  'aberto',
  'em_andamento',
  'aguardando_analista',
  'aguardando_usuario',
  'aprovado',
  'resolvido',
  'fechado',
] as const;
export const TicketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando_analista: 'Aguardando analista',
  aguardando_usuario: 'Aguardando você',
  aprovado: 'Aprovado',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

/** Status em que o chamado ainda está "aberto" para fins de duplicidade e listagem. */
export const OPEN_STATUSES: readonly TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_analista', 'aguardando_usuario', 'aprovado'];

/** Status em que a bola está com a TI — só nesses o prazo (SLA) corre. */
export const SLA_RUNNING_STATUSES: readonly TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_analista', 'aprovado'];

export function isOpenStatus(status: TicketStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export const RoleSchema = z.enum(['funcionario', 'analista']);
export type Role = z.infer<typeof RoleSchema>;

/** Quem chama o serviço de chamados. 'sistema' é o próprio app (ex.: login) e só acessa o diretório. */
export const ActorRoleSchema = z.enum(['funcionario', 'analista', 'sistema']);
export type ActorRole = z.infer<typeof ActorRoleSchema>;

export const EmployeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: RoleSchema,
  department: z.string(),
  /** Equipamento principal — usado para checar se um artigo se aplica. */
  device: z.string().nullable(),
  os: z.string().nullable(),
  /** Para analistas: "Suporte N1" ou "Suporte N2". */
  team: z.string().nullable(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

export const TicketSchema = z.object({
  id: z.string(),
  type: TicketTypeSchema,
  title: z.string(),
  description: z.string(),
  category: CategorySchema,
  priority: PrioritySchema,
  status: TicketStatusSchema,
  affected: AffectedSchema,
  requesterId: z.string(),
  assignedQueue: z.string().nullable(),
  assignedTo: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Última atualização feita pela TI: é a âncora do prazo (primeira resposta e cada atualização). */
  lastSupportUpdateAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const TicketEventSchema = z.object({
  id: z.number(),
  ticketId: z.string(),
  at: z.string(),
  author: z.enum(['funcionario', 'agent', 'analista', 'sistema']),
  authorName: z.string().nullable(),
  kind: z.enum(['criado', 'comentario', 'status', 'transferencia', 'reaberto']),
  text: z.string(),
});
export type TicketEvent = z.infer<typeof TicketEventSchema>;

export const KbArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: CategorySchema,
  tags: z.array(z.string()),
  /** Restrições de aplicabilidade (ex.: só Windows 10). Vazio = vale para todos. */
  appliesToOs: z.array(z.string()),
  updatedAt: z.string(),
});
export type KbArticle = z.infer<typeof KbArticleSchema>;

export const KbSearchHitSchema = z.object({
  article: KbArticleSchema,
  score: z.number(),
});
export type KbSearchHit = z.infer<typeof KbSearchHitSchema>;

export const CreateTicketInputSchema = z.object({
  type: TicketTypeSchema,
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(2000),
  category: CategorySchema,
  priority: PrioritySchema,
  affected: AffectedSchema,
  requesterId: z.string(),
});
export type CreateTicketInput = z.infer<typeof CreateTicketInputSchema>;

export type SupportQueue = 'Suporte N1' | 'Suporte N2';
