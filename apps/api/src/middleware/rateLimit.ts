import rateLimit from 'express-rate-limit';

import { config } from '../config';

const isTest = config.env === 'test';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 0 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'too_many_requests', message: 'too many auth attempts' } },
});
