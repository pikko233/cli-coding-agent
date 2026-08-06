import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type InferUITools,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { db } from "@cli-coding-agent/database/client";
import type { Prisma } from "@cli-coding-agent/database";
import {
  getToolContracts,
  modeSchema,
  type ModeType,
  type ToolContracts,
} from "@cli-coding-agent/shared";
import { buildSystemPrompt } from "../system-prompt";
import type { AuthenticatedEnv } from "../middleware/require-auth";
import { requireCreditsBalance } from "../middleware/require-credits-balance";
import { calculateCreditsForUsage } from "../lib/credit";
import { ingestAiUsage } from "../lib/polar";
import { isSupportedChatModel, resolveChatModel } from "../lib/models";

type ChatMessageMetadata = {
  mode?: ModeType;
  model?: string;
  durationMs?: number;
  usage?: LanguageModelUsage;
};

// 前后端共用的聊天消息类型，包含模型信息、耗时和工具调用结果
type CustomUIMessage = UIMessage<
  ChatMessageMetadata,
  never,
  InferUITools<ToolContracts>
>;

const submitSchema = z.object({
  id: z.string(),
  messages: z
    .array(
      z.custom<CustomUIMessage>((value) => {
        return (
          value != null &&
          typeof value === "object" &&
          "id" in value &&
          "parts" in value
        );
      }),
    )
    .min(1),
  mode: modeSchema,
  model: z.string().refine(isSupportedChatModel, "不支持该模型"),
});

const submitValidator = zValidator("json", submitSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "请求参数错误" }, 400);
  }
});

// 判断消息里是否还有未完成的工具调用
function hasPendingToolCalls(message: CustomUIMessage) {
  return message.parts.some((part) => {
    // 普通文本等片段不需要检查状态
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      const state = (part as { state?: string }).state;
      // 工具成功或失败都代表这次调用已经结束
      return state !== "output-available" && state !== "output-error";
    }

    return false;
  });
}

const app = new Hono<AuthenticatedEnv>().post(
  "/",
  requireCreditsBalance,
  submitValidator,
  async (c) => {
    const userId = c.get("userId");
    const { id, messages, mode, model } = c.req.valid("json");

    // 只允许用户访问自己的会话
    const session = await db.session.findUnique({
      where: { id, userId },
    });

    if (!session) {
      return c.json({ error: "未找到会话信息" }, 404);
    }

    const startTime = Date.now();
    const tools = getToolContracts(mode);
    const resolvedModel = resolveChatModel(model);
    const previousMessages = Array.isArray(session.messages)
      ? (session.messages as unknown as CustomUIMessage[])
      : [];
    const mergedMessages = [...previousMessages];

    // 按消息 ID 合并客户端消息，避免重试时重复追加同一条消息
    for (const message of messages) {
      const incomingMessage = {
        ...message,
        metadata: {
          ...message.metadata,
          mode,
          model,
        },
      } satisfies CustomUIMessage;

      const existingMessageIndex = mergedMessages.findIndex(
        (m) => m.id === incomingMessage.id,
      );

      if (existingMessageIndex === -1) {
        mergedMessages.push(incomingMessage);
      } else {
        mergedMessages[existingMessageIndex] = incomingMessage;
      }
    }

    // 校验消息和工具调用，再转换成模型能够读取的格式
    const nextMessages = await validateUIMessages<CustomUIMessage>({
      messages: mergedMessages,
      tools,
    });
    const modelMessages = await convertToModelMessages(nextMessages, {
      tools,
    });
    let completedUsage: LanguageModelUsage | null = null;

    // 启动模型生成，并在完成时记录本次 token 用量
    const result = streamText({
      model: resolvedModel.model,
      system: buildSystemPrompt({ mode }),
      messages: modelMessages,
      tools,
      providerOptions: resolvedModel.providerOptions,
      onFinish(event) {
        completedUsage = event.usage;
      },
    });

    // 把模型输出转换成前端可直接消费的 SSE 流式响应
    return createUIMessageStreamResponse({
      stream: toUIMessageStream<typeof tools, CustomUIMessage>({
        stream: result.stream,
        tools,
        originalMessages: nextMessages,
        messageMetadata({ part }) {
          if (part.type === "start") {
            return { mode, model };
          }

          if (part.type !== "finish") return undefined;

          return {
            mode,
            model,
            durationMs: Date.now() - startTime,
            ...(completedUsage ? { usage: completedUsage } : {}),
          };
        },
        async onFinish(event) {
          // 中断或工具尚未执行完时，不保存不完整的回复
          if (event.isAborted) return;

          if (hasPendingToolCalls(event.responseMessage)) return;

          // 回复完整后，将最新消息列表保存到会话
          await db.session.update({
            where: { id, userId },
            data: {
              messages: event.messages as unknown as Prisma.InputJsonValue,
            },
          });

          if (!completedUsage) return;

          try {
            // 将 token 用量换算为积分并上报计费系统
            const billableUsage = calculateCreditsForUsage({
              provider: resolvedModel.provider,
              model: resolvedModel.modelId,
              usage: completedUsage,
            });

            await ingestAiUsage({
              externalCustomerId: userId,
              eventId: `chat-message:${event.responseMessage.id}`,
              credits: billableUsage.credits,
            });
          } catch (error) {
            console.error("Failed to ingest Polar AI usage for chat message", {
              error,
              sessionId: id,
              messageId: event.responseMessage.id,
              userId,
            });
          }
        },
        onError(error) {
          return error instanceof Error ? error.message : String(error);
        },
      }),
    });
  },
);

export default app;
