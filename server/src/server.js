import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { buildApp } from './app.js';
import { startDuaScheduler } from './duas.js';
import { startTrashScheduler } from './trash.js';
import { pushNotification } from './notify.js';

const cfg = loadConfig();
const pool = createPool(cfg.db);
const app = await buildApp(cfg, { pool });
await app.listen({ port: cfg.port, host: cfg.host });
startTrashScheduler(app); // corbeille : suppression définitive après 60 jours
startDuaScheduler(app, pushNotification); // invocation de l'heure (pour ceux qui l'ont activée)

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
