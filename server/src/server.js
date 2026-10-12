import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const pool = createPool(cfg.db);
const app = await buildApp(cfg, { pool });
await app.listen({ port: cfg.port, host: cfg.host });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
