export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const NotFound = (resource: string, id?: string) =>
  new AppError(404, 'not_found', `${resource} not found`, id ? { id } : undefined);

export const BadRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, 'bad_request', message, details);

export const Conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError(409, 'conflict', message, details);

export const Unauthorized = (message = 'unauthorized') =>
  new AppError(401, 'unauthorized', message);

export const Forbidden = (message = 'forbidden') => new AppError(403, 'forbidden', message);
