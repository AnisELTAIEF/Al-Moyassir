import mysql from 'mysql2/promise';

export function createPool(db) {
  return mysql.createPool({
    ...db,
    charset: 'utf8mb4',
    timezone: 'Z',           // toutes les dates en UTC
    dateStrings: false,
    connectionLimit: 10,
    namedPlaceholders: false,
    multipleStatements: false,
  });
}

/** Exécute `fn` dans une transaction. */
export async function tx(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
