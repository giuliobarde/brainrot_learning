import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: `Route not found: ${req.method} ${req.path}` },
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log ?? console;

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'validation failed', details: { issues: err.issues } },
    });
    return;
  }

  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  ) {
    res.status(409).json({
      error: {
        code: 'conflict',
        message: 'duplicate key',
        details: { keyValue: (err as { keyValue?: Record<string, unknown> }).keyValue },
      },
    });
    return;
  }

  log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'internal server error' } });
};
