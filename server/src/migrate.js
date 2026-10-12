// Applique les fichiers sql/NNN_*.sql non encore appliqués (table schema_migrations).
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadConfig } from './config.js';

const SQL_DIR = fileURLToPath(new URL('../sql/', import.meta.url));

export async function migrate(dbConfig, log = console.log) {
  const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true, charset: 'utf8mb4' });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const files = (await readdir(SQL_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      log(`→ ${f}`);
      await conn.query(await readFile(SQL_DIR + f, 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
    }
    log('Migrations à jour.');
  } finally {
    await conn.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  migrate(cfg.db).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
