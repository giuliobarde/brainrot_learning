import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

import { BadRequest } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(BadRequest('validation failed', { issues: result.error.issues, source }));
      return;
    }
    (req as Request & { validated: Record<Source, unknown> }).validated = {
      ...((req as Request & { validated?: Record<Source, unknown> }).validated ?? {}),
      [source]: result.data,
    } as Record<Source, unknown>;
    next();
  };
}

export function getValidated<T>(req: Request, source: Source = 'body'): T {
  const bag = (req as Request & { validated?: Record<Source, unknown> }).validated;
  if (!bag || !(source in bag)) {
    throw new Error(`No validated ${source} on request — missing validate() middleware?`);
  }
  return bag[source] as T;
}

export type Infer<S extends ZodTypeAny> = z.infer<S>;
