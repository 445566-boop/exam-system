/**
 * 本地部署 - OpenAI 兼容 API 适配器
 * 
 * 使用说明：
 * 1. 安装 openai: pnpm add openai
 * 2. 配置 .env.local 中的 OPENAI_API_KEY
 * 3. 将 API 路由中的 coze-coding-dev-sdk 替换为使用本文件
 * 
 * 注意：此文件需要在安装了 openai 包后才能使用
 */

interface LLMMessage {
  role: string;
  content: string;
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * 获取 OpenAI 客户端实例
 */
async function getOpenAIClient() {
  // @ts-ignore - openai 包需要在本地部署时安装
  const { default: OpenAI } = await import('openai');
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    dangerouslyAllowBrowser: false,
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
  const openai = await getOpenAIClient();
  
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
    temperature: 0.3,
  });

  let fullContent = '';
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullContent += content;
      onChunk(content);
    }
  }

  return fullContent;
}

/**
 * 非流式调用 LLM
 * @param messages 消息列表
 */
export async function callLLM(messages: LLMMessage[]): Promise<string> {
  const openai = await getOpenAIClient();
  
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || '';
}
