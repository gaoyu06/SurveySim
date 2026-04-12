import { z } from "zod";
import type { ChatMessage } from "../llm/openai-compatible.adapter.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";
import { buildJsonFixerPrompt } from "./prompt-support/schema-text.js";

// ── Output schema ──
const translationChatResponseSchema = z.object({
  message: z.string(),
  collectedFields: z.object({
    title: z.string().optional(),
    dramaTheme: z.string().optional(),
    targetMarket: z.string().optional(),
    targetCulture: z.string().optional(),
    sourceLanguage: z.string().optional(),
    targetLanguage: z.string().optional(),
  }),
  missingFields: z.array(z.string()),
  ready: z.boolean(),
});

export type TranslationChatResponse = z.infer<typeof translationChatResponseSchema>;

export { translationChatResponseSchema };

// ── Task builder ──
export function buildTranslationChatTask(input: {
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  locale?: string;
}): { messages: ChatMessage[]; fixerPrompt: string } {
  const isZh = input.locale?.startsWith("zh");

  const systemPrompt = isZh
    ? `你是一位专业的出海短剧翻译评估顾问。你的任务是通过自然对话，帮助用户创建一个翻译评估项目。

你需要从对话中提取以下项目信息：
- title（项目名称）— 必填
- dramaTheme（短剧主题，例如：都市甜宠、古风穿越）
- targetMarket（目标市场，例如：北美、东南亚、中东）
- targetCulture（目标文化背景，例如：美式英语日常文化）
- sourceLanguage（源语言，例如：中文）
- targetLanguage（目标语言）— 必填

规则：
1. 用自然、友好的语气对话，不要一次问太多问题
2. 从用户的描述中主动提取信息，避免重复追问
3. 如果用户提供了足够的信息，可以直接确认而不再追问
4. 判断 ready 的条件：title 和 targetLanguage 已明确
5. missingFields 列出当前仍未收集到的字段名（用英文 key）
6. 如果用户用中文对话，请用中文回复；如果用英文，请用英文回复
7. 不要提到 JSON、schema、字段等技术概念`
    : `You are a professional short drama translation evaluation consultant. Your task is to help users create a translation evaluation project through natural conversation.

You need to extract the following project information from the conversation:
- title (project name) — required
- dramaTheme (drama theme, e.g., urban romance, historical fantasy)
- targetMarket (target market, e.g., North America, Southeast Asia, Middle East)
- targetCulture (target cultural context, e.g., American English everyday culture)
- sourceLanguage (source language, e.g., Chinese)
- targetLanguage (target language) — required

Rules:
1. Use a natural, friendly tone. Don't ask too many questions at once.
2. Proactively extract information from the user's description. Avoid redundant questions.
3. If the user has provided enough information, confirm directly without asking more.
4. Set ready=true when: title and targetLanguage are both confirmed.
5. missingFields should list field keys (in English) that are still not collected.
6. Match the user's language — reply in Chinese if they write in Chinese, English if they write in English.
7. Do not mention JSON, schemas, fields, or other technical concepts.`;

  // Build conversation history into user message
  const historyLines = input.conversationHistory
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n");

  const userContent = renderPromptSections([
    ...(historyLines
      ? [
          {
            title: "Conversation so far",
            lines: [historyLines],
          },
        ]
      : []),
    {
      title: "User's latest message",
      lines: [input.userMessage],
    },
    {
      title: "Output Schema",
      lines: [
        "Respond with a JSON object:",
        JSON.stringify({
          message: "Your natural language response to the user",
          collectedFields: {
            title: "extracted project name or omit if not provided",
            dramaTheme: "extracted theme or omit",
            targetMarket: "extracted market or omit",
            targetCulture: "extracted culture or omit",
            sourceLanguage: "extracted source language or omit",
            targetLanguage: "extracted target language or omit",
          },
          missingFields: ["array of field names still not collected"],
          ready: "true only when title and targetLanguage are both confirmed",
        }),
      ],
    },
  ]);

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    fixerPrompt: buildJsonFixerPrompt("TranslationChatResponse", translationChatResponseSchema),
  };
}
