import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

// 系统表 - 必须保留
export const healthCheck = pgTable("health_check", {
	id: serial("id").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 题库表 - 存储上传的题目和答案
export const questionBank = pgTable("question_bank", {
	id: serial("id").primaryKey(),
	question: text("question").notNull(),
	answer: text("answer").notNull(),
	correctAnswer: text("correct_answer"),
	type: text("type").notNull(), // 题型：单选、多选、判断、填空、简答
	difficulty: integer("difficulty").notNull().default(1), // 难度：1-简单 2-中等 3-困难
	options: jsonb("options").$type<string[]>(), // 选项（针对选择题）
	explanation: text("explanation"), // 解析
	fileKey: text("file_key"), // 对应的文件存储key
	subject: text("subject"), // 学科
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 试卷表 - 存储生成的试卷
export const examPaper = pgTable("exam_paper", {
	id: serial("id").primaryKey(),
	title: text("title").notNull(),
	content: jsonb("content").notNull().$type<{
		questions: Array<{
			id: number;
			question: string;
			type: string;
			difficulty: number;
			options?: string[];
		}>;
	}>(),
	config: jsonb("config").$type<{
		types: string[];
		count: number;
		difficulty: string;
	}>(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 错题表 - 存储用户的错题
export const wrongQuestion = pgTable("wrong_question", {
	id: serial("id").primaryKey(),
	questionId: integer("question_id").notNull(),
	question: text("question").notNull(),
	userAnswer: text("user_answer").notNull(),
	correctAnswer: text("correct_answer").notNull(),
	type: text("type").notNull(),
	difficulty: integer("difficulty").notNull(),
	options: jsonb("options").$type<string[]>(),
	explanation: text("explanation"),
	subject: text("subject"),
	count: integer("count").default(1),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 试卷提交表 - 存储用户提交的试卷
export const examSubmission = pgTable("exam_submission", {
	id: serial("id").primaryKey(),
	paperId: integer("paper_id").notNull(),
	answers: jsonb("answers").notNull().$type<{
		[questionId: number]: string;
	}>(),
	score: integer("score"),
	total: integer("total"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 用户表 - 存储账号密码
export const user = pgTable("user", {
	id: serial("id").primaryKey(),
	username: text("username").notNull().unique(),
	password: text("password").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});
