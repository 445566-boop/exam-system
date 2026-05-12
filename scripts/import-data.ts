// 数据导入脚本
// 使用方法: npx ts-node scripts/import-data.ts

import { Client } from 'pg';

// 线上题库数据
const questions = [
  // 生物单选题
  { question: "植物进行光合作用的主要场所是？", type: "单选", difficulty: 1, options: ["叶绿体", "线粒体", "细胞核", "液泡"], answer: "A", subject: "生物" },
  { question: "人体内氧气和二氧化碳交换的场所是？", type: "单选", difficulty: 1, options: ["气管", "肺泡", "心脏", "血液"], answer: "B", subject: "生物" },
  { question: "植物通过什么结构吸收水分和无机盐？", type: "单选", difficulty: 1, options: ["叶片", "根尖", "茎", "花"], answer: "B", subject: "生物" },
  { question: "人体最大的消化腺是？", type: "单选", difficulty: 1, options: ["胰腺", "肝脏", "唾液腺", "胃腺"], answer: "B", subject: "生物" },
  { question: "细胞分裂过程中，变化最明显的是？", type: "单选", difficulty: 1, options: ["细胞膜", "细胞质", "细胞核", "染色体"], answer: "D", subject: "生物" },
  { question: "人体形成尿液的器官是？", type: "单选", difficulty: 1, options: ["肾脏", "输尿管", "膀胱", "尿道"], answer: "A", subject: "生物" },
  { question: "被子植物双受精后，受精卵发育成？", type: "单选", difficulty: 2, options: ["胚", "胚乳", "种皮", "果实"], answer: "A", subject: "生物" },
  { question: "人体血液循环的动力器官是？", type: "单选", difficulty: 1, options: ["动脉", "静脉", "心脏", "毛细血管"], answer: "C", subject: "生物" },
  { question: "下列属于生态系统的是？", type: "单选", difficulty: 1, options: ["一片森林", "森林中所有生物", "森林中所有树木", "森林中所有土壤"], answer: "A", subject: "生物" },
  { question: "人体中枢神经系统的组成包括？", type: "单选", difficulty: 1, options: ["脑和脑神经", "脑和脊髓", "脊髓和脊神经", "脑神经和脊神经"], answer: "B", subject: "生物" },
  // ... 更多题目
];

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/exam_system'
  });

  await client.connect();
  console.log('Connected to database');

  for (const q of questions) {
    await client.query(
      `INSERT INTO question_bank (question, type, difficulty, options, correct_answer, subject) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [q.question, q.type, q.difficulty, JSON.stringify(q.options), q.answer, q.subject]
    );
  }

  console.log(`Imported ${questions.length} questions`);
  await client.end();
}

main().catch(console.error);
