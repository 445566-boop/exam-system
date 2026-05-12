/**
 * LLM 适配器 - 使用 coze-coding-dev-sdk（服务端专用）
 * 
 * 使用说明：
 * 1. 仅在服务端代码中使用（API routes）
 * 2. 使用动态导入避免 Next.js 编译问题
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMStreamChunk {
  content?: string | unknown;
}

// 默认使用 doubao-seed-2-0-lite-260215（均衡型模型，适合题库解析等生产任务）
const DEFAULT_MODEL = 'doubao-seed-2-0-lite-260215';

/**
 * 流式调用 LLM (Coze API)
 */
export async function streamLLM(
  messages: LLMMessage[],
  onChunk: (content: string) => void,
  options?: { model?: string; temperature?: number }
): Promise<string> {
  // 动态导入 coze-coding-dev-sdk
  const { LLMClient, Config } = await import('coze-coding-dev-sdk');
  
  const config = new Config({
    timeout: 120000,
  });
  const client = new LLMClient(config);

  const model = options?.model || DEFAULT_MODEL;
  const temperature = options?.temperature ?? 0.3;

  const stream = client.stream(
    messages,
    { model, temperature }
  );

  let fullContent = '';
  for await (const chunk of stream) {
    const content = (chunk as LLMStreamChunk).content;
    if (content) {
      const text = content.toString();
      fullContent += text;
      onChunk(text);
    }
  }

  return fullContent;
}

/**
 * 非流式调用 LLM (Coze API)
 */
export async function callLLM(
  messages: LLMMessage[],
  options?: { model?: string; temperature?: number }
): Promise<string> {
  // 动态导入 coze-coding-dev-sdk
  const { LLMClient, Config } = await import('coze-coding-dev-sdk');
  
  const config = new Config({
    timeout: 120000,
  });
  const client = new LLMClient(config);

  const model = options?.model || DEFAULT_MODEL;
  const temperature = options?.temperature ?? 0.3;

  const response = await client.invoke(
    messages,
    { model, temperature }
  );

  return response.content?.toString() || '';
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
