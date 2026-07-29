import { z } from "zod";

// tool工具调用参数校验
export const toolCallArgsSchema = z.record(z.string(), z.json());

// 消息片段校验
// 根据type的值，自动判断使用哪个子schema校验
export const messagePartSchema = z.discriminatedUnion("type", [
  // AI 思考过程
  z.object({
    type: z.literal("reasoning"),
    text: z.string(),
  }),
  // AI 调用工具
  z.object({
    type: z.literal("tool-call"),
    id: z.string(),
    name: z.string(),
    args: toolCallArgsSchema,
    result: z.string().optional(),
  }),
  // 文本回复输出
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
]);

export const messagePartsSchema = z.array(messagePartSchema);

export type messagePart = z.infer<typeof messagePartSchema>;

export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text-delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("reasoning-delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool-call"),
    toolCallId: z.string(),
    toolName: z.string(),
    args: toolCallArgsSchema,
  }),
  z.object({
    type: z.literal("tool-result"),
    toolCallId: z.string(),
    result: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    messageId: z.string(),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export type chatStreamEvent = z.infer<typeof chatStreamEventSchema>;
