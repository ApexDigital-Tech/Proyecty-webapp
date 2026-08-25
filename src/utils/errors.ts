export class TenantIsolationError extends Error {
  public statusCode: number;

  constructor(message: string = 'Recurso no encontrado o acceso denegado por aislamiento de tenant') {
    super(message);
    this.name = 'TenantIsolationError';
    this.statusCode = 404; // Se responde 404 en lugar de 403 para no revelar la existencia del recurso.
  }
}

export class NotFoundError extends Error {
  public statusCode: number;

  constructor(message: string = 'Recurso no encontrado') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class ForbiddenError extends Error {
  public statusCode: number;

  constructor(message: string = 'Acceso denegado: Permisos insuficientes') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

export class ConflictError extends Error {
  public statusCode: number;

  constructor(message: string = 'Conflicto de negocio o violación de segregación de funciones') {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

export class ValidationError extends Error {
  public statusCode: number;

  constructor(message: string = 'Datos de entrada inválidos') {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export class UnprocessableEntityError extends Error {
  public statusCode: number;

  constructor(message: string = 'Entidad no procesable o valor fuera del catálogo permitido') {
    super(message);
    this.name = 'UnprocessableEntityError';
    this.statusCode = 422;
  }
}

export class LockedError extends Error {
  public statusCode: number;

  constructor(message: string = 'Recurso bloqueado o no verificado (DOC-01)') {
    super(message);
    this.name = 'LockedError';
    this.statusCode = 423;
  }
}

export class UnauthorizedError extends Error {
  public statusCode: number;

  constructor(message: string = 'Autenticación requerida o sesión inválida') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}
