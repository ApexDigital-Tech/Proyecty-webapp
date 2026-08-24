export class TenantIsolationError extends Error {
  public statusCode: number;

  constructor(message: string = 'Recurso no encontrado o acceso denegado por aislamiento de tenant') {
    super(message);
    this.name = 'TenantIsolationError';
    this.statusCode = 404; // Se responde 404 en lugar de 403 para no revelar la existencia del recurso.
  }
}
