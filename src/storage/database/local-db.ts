import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './shared/schema';

let db: ReturnType<typeof drizzle> | null = null;

export function getLocalDb() {
  if (db) return db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for local PostgreSQL');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  db = drizzle(pool, { schema });
  return db;
}

// 检查是否使用本地数据库
export function useLocalDatabase(): boolean {
  const useLocal = process.env.USE_LOCAL_DATABASE === 'true' || 
                   (!process.env.COZE_SUPABASE_URL && !!process.env.DATABASE_URL);
  return useLocal;
}
