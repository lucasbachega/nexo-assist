import { z } from 'zod';
import { AffectedSchema, type Affected, type Priority, type TicketType } from './domain';

/**
 * Matriz de prioridade do Anexo A.
 *
 * Prioridade = impacto (quantas pessoas) × urgência (compromisso em risco).
 *
 * | Prioridade | Quando usar                                                         |
 * |------------|---------------------------------------------------------------------|
 * | Crítica    | Algo parado para uma equipe ou para a empresa                        |
 * | Alta       | Impede uma pessoa de trabalhar, ou há um compromisso no mesmo dia    |
 * | Média      | Atrapalha, mas há alternativa                                        |
 * | Baixa      | Pedidos e melhorias sem urgência                                     |
 *
 * O modelo só extrai os fatos (PriorityFacts) da conversa; a regra é determinística
 * e testada. Assim a prioridade não "varia com o humor" do modelo e é explicável.
 */
export const PriorityFactsSchema = z.object({
  affected: AffectedSchema.describe('Quem é afetado: só a pessoa, a equipe ou a empresa toda'),
  workStopped: z.boolean().describe('true se o problema impede de trabalhar (algo parado), false se atrapalha mas dá para seguir'),
  hasWorkaround: z.boolean().describe('true se existe alternativa razoável enquanto o chamado é tratado'),
  sameDayCommitment: z.boolean().describe('true se há um compromisso hoje em risco (reunião, entrega, apresentação)'),
});
export type PriorityFacts = z.infer<typeof PriorityFactsSchema>;

export interface PriorityDecision {
  priority: Priority;
  /** Regra aplicada, em linguagem natural — vai para o painel de transparência. */
  rule: string;
}

export function classifyPriority(type: TicketType, facts: PriorityFacts): PriorityDecision {
  const collective = facts.affected !== 'somente_voce';
  const who: Record<Affected, string> = {
    somente_voce: 'uma pessoa',
    equipe: 'a equipe',
    empresa: 'a empresa',
  };

  if (collective && facts.workStopped) {
    return { priority: 'critica', rule: `Algo parado para ${who[facts.affected]} → Crítica` };
  }
  if (collective) {
    return {
      priority: 'alta',
      rule: `Afeta ${who[facts.affected]}, mas não está totalmente parado → Alta`,
    };
  }
  if (facts.sameDayCommitment) {
    return { priority: 'alta', rule: 'Compromisso no mesmo dia em risco → Alta' };
  }
  if (facts.workStopped && !facts.hasWorkaround) {
    return { priority: 'alta', rule: 'Impede uma pessoa de trabalhar, sem alternativa → Alta' };
  }
  if (type === 'REQ' && !facts.workStopped) {
    return { priority: 'baixa', rule: 'Pedido sem urgência → Baixa' };
  }
  return { priority: 'media', rule: 'Atrapalha, mas há alternativa → Média' };
}
