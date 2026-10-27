/** Erro de regra/uso com status HTTP — as rotas o convertem em resposta JSON. */
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'erro',
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
