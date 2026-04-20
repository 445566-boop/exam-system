/**
 * LLM 适配器 - 使用原生 axios 调用 OpenAI 兼容 API
 * 
 * 支持任何兼容 OpenAI API 格式的服务商：
 * - OpenAI
 * - DeepSeek
 * - Kimi
 * - 本地部署的 LLM 服务
 * 
 * 环境变量配置：
 * - OPENAI_API_KEY: API 密钥
 * - OPENAI_BASE_URL: API 基础 URL (默认: https://api.openai.com/v1)
 * - OPENAI_MODEL: 模型名称 (默认: gpt-4o-mini)
 */

import axios, { AxiosInstance } from 'axios';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
}

function getConfig(): LLMConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.3,
  };
}

/**
 * 创建 LLM 客户端
 */
function createClient(): AxiosInstance {
  const config = getConfig();
  return axios.create({
    baseURL: config.baseURL,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    timeout: 120000, // 2分钟超时
  });
}

/**
 * 流式调用 LLM
 * @param messages 消息列表
 * @param onChunk 每次接收到的文本块回调
 */
export async function streamLLM(
  messages: LLMMessage[],
  onChunk: (content: string) => void
): Promise<string> {
  const config = getConfig();
  const client = createClient();

  const response = await client.post(
    '/chat/completions',
    {
      model: config.model,
      messages,
      stream: true,
      temperature: config.temperature,
    },
    {
      responseType: 'stream',
    }
  );

  const stream = response.data as NodeJS.ReadableStream;
  let fullContent = '';

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              onChunk(content);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    stream.on('end', () => {
      resolve(fullContent);
    });

    stream.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * 非流式调用 LLM
 * @param messages 消息列表
 */
export async function callLLM(messages: LLMMessage[]): Promise<string> {
  const config = getConfig();
  const client = createClient();

  const response = await client.post('/chat/completions', {
    model: config.model,
    messages,
    temperature: config.temperature,
  });

  return response.data.choices?.[0]?.message?.content || '';
}

/**
 * 提取 JSON 内容（从 markdown 代码块或纯文本中）
 */
export function extractJSON(text: string): string {
  // 移除 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  // 移除前后空白
  return text.trim();
}
