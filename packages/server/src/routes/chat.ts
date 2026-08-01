import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamText as aiStreamText, stepCountIs } from "ai";
import { db } from "@cli-coding-agent/database/client";
import { Mode, MessageStatus, Role } from "@cli-coding-agent/database/enums";
import type { Prisma } from "@cli-coding-agent/database";
import {
  type ChatStreamEvent,
  type MessagePart,
  toolCallArgsSchema,
  messagePartsSchema,
} from "@cli-coding-agent/shared";
import { createTools } from "../tools";
import { buildSystemPrompt } from "../system-prompt";
import { isSupportedChatModel, resolveChatModel } from "../lib/models";

const submitSchema = z.object({
  content: z.string().trim().min(1, "消息内容不能为空"),
  mode: z.enum(Mode),
  model: z.string().refine(isSupportedChatModel, "暂不支持该模型"),
});

const submitValidator = zValidator("json", submitSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "AI对话请求参数错误" }, 400);
  }
});

const activeResumeSessionIds = new Set<string>();

// 只把可供模型继续理解的用户/助手消息放入上下文。
function buildConversationHistory(
  messages: {
    role: Role;
    content: string;
    status: MessageStatus;
  }[],
) {
  return messages.flatMap((msg) => {
    if (msg.role === "ERROR") return [];
    if (msg.role === "ASSISTANT" && msg.content.length === 0) return [];
    return [
      {
        role:
          msg.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const),
        content: msg.content,
      },
    ];
  });
}

function getResumableUserMessage(
  messages: {
    role: Role;
    mode: Mode;
    model: string;
  }[],
) {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "USER") {
    return null;
  }

  return lastMessage;
}

type StreamParams = {
  sessionId: string;
  model: string;
  cwd: string | null;
  history: { role: "user" | "assistant"; content: string }[];
  mode: Mode;
  abortController: AbortController;
};

// 调用模型，将AI回复的文本片段持续推送给客户端，并保存最终结果。
async function streamAIResponse(
  stream: Parameters<Parameters<typeof streamSSE>[1]>[0],
  params: StreamParams,
) {
  const { sessionId, model, cwd, history, mode, abortController } = params;
  const startTime = Date.now();
  const resolvedModal = resolveChatModel(model);
  const parts: MessagePart[] = [];
  const tools = cwd ? createTools(cwd, mode) : undefined;

  const persistInterruptedMessage = async () => {
    const fullText = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");

    if (fullText.length === 0 && parts.length === 0) return;

    const durationMs = Date.now() - startTime;

    const validatedParts: Prisma.InputJsonValue | undefined =
      parts.length > 0 ? messagePartsSchema.parse(parts) : undefined;

    await db.message.create({
      data: {
        sessionId,
        role: "ASSISTANT",
        status: MessageStatus.INTERRUPTED,
        mode,
        model,
        content: fullText,
        parts: validatedParts,
        duration: Math.round(durationMs / 1000),
      },
    });
  };

  try {
    const result = aiStreamText({
      model: resolvedModal.model,
      system: buildSystemPrompt({ cwd, mode }),
      tools,
      stopWhen: tools ? stepCountIs(50) : undefined,
      messages: history,
      abortSignal: abortController.signal,
      providerOptions: resolvedModal.providerOptions,
    });

    // 一边向客户端转发文本片段，一边拼接完整回复。
    for await (const part of result.stream) {
      if (stream.aborted) break;

      // 合并流式输出的推理片段
      if (part.type === "reasoning-delta") {
        const last = parts[parts.length - 1];
        if (last?.type === "reasoning") {
          last.text += part.text;
        } else {
          parts.push({
            type: "reasoning",
            text: part.text,
          });
        }

        const event: ChatStreamEvent = {
          type: "reasoning-delta",
          text: part.text,
        };
        await stream.writeSSE({
          event: "reasoning-delta",
          data: JSON.stringify(event),
        });
      }

      // 合并流式输出的文本消息片段
      if (part.type === "text-delta") {
        const last = parts[parts.length - 1];
        if (last?.type === "text") {
          last.text += part.text;
        } else {
          parts.push({
            type: "text",
            text: part.text,
          });
        }

        const event: ChatStreamEvent = {
          type: "text-delta",
          text: part.text,
        };
        await stream.writeSSE({
          event: "text-delta",
          data: JSON.stringify(event),
        });
      }

      // 工具调用信息
      if (part.type === "tool-call") {
        const args = toolCallArgsSchema.parse(part.input);

        parts.push({
          type: "tool-call",
          id: part.toolCallId,
          name: part.toolName,
          args,
        });

        const event: ChatStreamEvent = {
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args,
        };

        await stream.writeSSE({
          event: "tool-call",
          data: JSON.stringify(event),
        });
      }

      if (part.type === "tool-result") {
        const resultStr =
          typeof part.output === "string" ? part.output : String(part.output);

        const toolCallPart = parts.find(
          (p): p is Extract<MessagePart, { type: "tool-call" }> =>
            p.type === "tool-call" && p.id === part.toolCallId,
        );

        if (toolCallPart) {
          toolCallPart.result = resultStr;
        }

        const event: ChatStreamEvent = {
          type: "tool-result",
          toolCallId: part.toolCallId,
          result: resultStr,
        };
        await stream.writeSSE({
          event: "tool-result",
          data: JSON.stringify(event),
        });
      }

      if (part.type === "error") {
        throw part.error;
      }
    }

    // 客户端断开后保存未完成的回复。
    if (stream.aborted || abortController.signal.aborted) {
      await persistInterruptedMessage();
      return;
    }

    const durationMs = Date.now() - startTime;
    const fullText = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    const validatedParts: Prisma.InputJsonValue | undefined =
      parts.length > 0 ? messagePartsSchema.parse(parts) : undefined;

    // 流正常结束后保存完整的助手消息。
    const assistantMessage = await db.message.create({
      data: {
        sessionId,
        role: "ASSISTANT",
        status: MessageStatus.COMPLETE,
        model,
        content: fullText,
        parts: validatedParts,
        mode,
        duration: Math.round(durationMs / 1000),
      },
    });

    const doneEvent: ChatStreamEvent = {
      type: "done",
      messageId: assistantMessage.id,
      durationMs: durationMs,
    };

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify(doneEvent),
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      await persistInterruptedMessage();
      return;
    }

    const message = error instanceof Error ? error.message : String(error);

    const duration = Math.round((Date.now() - startTime) / 1000);

    // 记录模型错误，并通知客户端结束本次请求。
    await db.message.create({
      data: {
        sessionId,
        role: "ERROR",
        status: MessageStatus.COMPLETE,
        content: message,
        mode,
        model,
        duration,
      },
    });

    const errorEvent: ChatStreamEvent = {
      type: "error",
      message,
    };
    await stream.writeSSE({
      event: "error",
      data: JSON.stringify(errorEvent),
    });
  }
}

const app = new Hono()
  // 当最后一句话为用户消息、缺少AI助手回复时，重新请求AI接口。
  .post("/:sessionId/resume", async (c) => {
    const sessionId = c.req.param("sessionId");

    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!session) {
      return c.json({ error: "未找到对应的会话" }, 404);
    }
    const resumableMessage = getResumableUserMessage(session.messages);

    if (!resumableMessage) {
      return c.json({ error: "当前会话中没有等待恢复的用户消息" }, 409);
    }

    if (!isSupportedChatModel(resumableMessage.model)) {
      return c.json(
        { error: `暂不支持该模型: ${resumableMessage.model}` },
        400,
      );
    }

    if (activeResumeSessionIds.has(sessionId)) {
      return c.json({ error: "会话已有一个进行中的恢复操作" }, 409);
    }

    activeResumeSessionIds.add(sessionId);

    const history = buildConversationHistory(session.messages);
    const abortController = new AbortController();

    try {
      return streamSSE(
        c,
        async (stream) => {
          stream.onAbort(() => {
            abortController.abort();
            activeResumeSessionIds.delete(sessionId);
          });

          try {
            await streamAIResponse(stream, {
              sessionId,
              model: resumableMessage.model,
              cwd: session.cwd,
              history,
              mode: resumableMessage.mode,
              abortController,
            });
          } finally {
            activeResumeSessionIds.delete(sessionId);
          }
        },
        async (error, stream) => {
          activeResumeSessionIds.delete(sessionId);
          const message =
            error instanceof Error ? error.message : String(error);
          const errorEvent: ChatStreamEvent = {
            type: "error",
            message,
          };
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify(errorEvent),
          });
        },
      );
    } catch (error) {
      activeResumeSessionIds.delete(sessionId);
      throw error;
    }
  })
  // 保存用户消息，并以 SSE 流式返回模型回复。
  .post("/:sessionId", submitValidator, async (c) => {
    const sessionId = c.req.param("sessionId");

    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!session) {
      return c.json({ error: "未找到对应的会话信息" }, 404);
    }

    const data = c.req.valid("json");

    // 先落库，连接中断后仍可通过 resume 接口继续。
    await db.message.create({
      data: {
        sessionId,
        role: "USER",
        status: MessageStatus.COMPLETE,
        content: data.content,
        mode: data.mode,
        model: data.model,
      },
    });

    const history = buildConversationHistory([
      ...session.messages,
      {
        role: "USER" as const,
        content: data.content,
        status: MessageStatus.COMPLETE,
      },
    ]);

    const abortController = new AbortController();

    return streamSSE(
      c,
      async (stream) => {
        // 客户端断开时同时取消上游模型请求。
        stream.onAbort(() => {
          abortController.abort();
        });

        await streamAIResponse(stream, {
          sessionId,
          model: data.model,
          cwd: session.cwd,
          history,
          mode: data.mode,
          abortController,
        });
      },
      async (error, stream) => {
        const message = error instanceof Error ? error.message : String(error);
        const errorEvent: ChatStreamEvent = {
          type: "error",
          message,
        };
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify(errorEvent),
        });
      },
    );
  });

export default app;
