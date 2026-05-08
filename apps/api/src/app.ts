import express, { type Express, type Request, type Response } from 'express';

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ data: { status: 'ok' } });
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({ data: { name: 'brainrot-api', version: '0.1.0' } });
  });

  return app;
}
