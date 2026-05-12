import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './shared/schema';
import { questionBank, wrongQuestion } from './shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

let db: ReturnType<typeof drizzle> | null = null;
let pool: Pool | null = null;

export function getLocalDb() {
  if (db) return db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for local PostgreSQL');
  }

  pool = new Pool({
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

// 统一数据库客户端接口
export function getDatabaseClient() {
  const db = getLocalDb();
  
  return {
    // 查询题库
    async selectQuestions(options?: { 
      subject?: string; 
      type?: string; 
      difficulty?: number;
      limit?: number;
    }) {
      let query = db.select().from(questionBank);
      
      const conditions = [];
      if (options?.subject) {
        conditions.push(eq(questionBank.subject, options.subject));
      }
      if (options?.type) {
        conditions.push(eq(questionBank.type, options.type));
      }
      if (options?.difficulty) {
        conditions.push(eq(questionBank.difficulty, options.difficulty));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }
      
      if (options?.limit) {
        query = query.limit(options.limit) as typeof query;
      }
      
      return query.execute();
    },
    
    // 获取所有题目（简单查询）
    async selectAllQuestions() {
      return db.select().from(questionBank).execute();
    },
    
    // 统计查询
    async countQuestions(options?: { subject?: string }) {
      if (options?.subject) {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(questionBank)
          .where(eq(questionBank.subject, options.subject))
          .execute();
        return Number(result[0]?.count || 0);
      }
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(questionBank)
        .execute();
      return Number(result[0]?.count || 0);
    },
    
    // 插入题目
    async insertQuestion(data: typeof questionBank.$inferInsert) {
      return db.insert(questionBank).values(data).returning().execute();
    },
    
    // 批量插入题目
    async insertQuestions(data: (typeof questionBank.$inferInsert)[]) {
      return db.insert(questionBank).values(data).returning().execute();
    },
    
    // 查询错题
    async selectWrongQuestions(options?: { subject?: string }) {
      let query = db.select().from(wrongQuestion);
      
      if (options?.subject) {
        query = query.where(eq(wrongQuestion.subject, options.subject)) as typeof query;
      }
      
      return query.execute();
    },
    
    // 插入错题
    async insertWrongQuestion(data: typeof wrongQuestion.$inferInsert) {
      return db.insert(wrongQuestion).values(data).returning().execute();
    },
    
    // 更新错题计数
    async updateWrongQuestionCount(id: number, newCount: number) {
      return db.update(wrongQuestion)
        .set({ count: newCount })
        .where(eq(wrongQuestion.id, id))
        .execute();
    },
    
    // 删除错题
    async deleteWrongQuestion(id: number) {
      return db.delete(wrongQuestion).where(eq(wrongQuestion.id, id)).execute();
    },
    
    // 查询错题是否存在
    async findWrongQuestionByQuestionId(questionId: number) {
      const result = await db.select()
        .from(wrongQuestion)
        .where(eq(wrongQuestion.questionId, questionId))
        .execute();
      return result[0] || null;
    },
    
    // 原始 Drizzle 实例（用于复杂查询）
    get raw() {
      return db;
    }
  };
}

// 关闭连接
export async function closeConnection() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
