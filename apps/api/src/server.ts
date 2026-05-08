import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.info(`[api] listening on http://localhost:${config.port} (env=${config.env})`);
});
