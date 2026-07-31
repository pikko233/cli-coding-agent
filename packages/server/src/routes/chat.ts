import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamText as aiStreamText } from "ai";
import { db } from "@cli-coding-agent/database/client";
import { Mode, MessageStatus, Role } from "@cli-coding-agent/database/enums";
import { type ChatStreamEvent } from "@cli-coding-agent/shared";
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
  history: { role: "user" | "assistant"; content: string }[];
  mode: Mode;
  abortController: AbortController;
};

// 调用模型，将AI回复的文本片段持续推送给客户端，并保存最终结果。
async function streamAIResponse(
  stream: Parameters<Parameters<typeof streamSSE>[1]>[0],
  params: StreamParams,
) {
  const { sessionId, model, history, mode, abortController } = params;
  const startTime = Date.now();
  const resolvedModal = resolveChatModel(model);
  let fullText = "";

  const persistInterruptedMessage = async () => {
    if (fullText.length === 0) return 0;
    const durationMs = Date.now() - startTime;
    await db.message.create({
      data: {
        sessionId,
        role: "ASSISTANT",
        status: MessageStatus.INTERRUPTED,
        mode,
        model,
        content: fullText,
        duration: Math.round(durationMs / 1000),
      },
    });
  };

  try {
    const result = aiStreamText({
      model: resolvedModal.model,
      messages: history,
      abortSignal: abortController.signal,
    });

    // 一边向客户端转发文本片段，一边拼接完整回复。
    for await (const part of result.stream) {
      if (stream.aborted) break;

      if (part.type === "text-delta") {
        fullText += part.text;
        const event: ChatStreamEvent = {
          type: "text-delta",
          text: part.text,
        };
        await stream.writeSSE({
          event: "text-delta",
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

    // 流正常结束后保存完整的助手消息。
    const assistantMessage = await db.message.create({
      data: {
        sessionId,
        role: "ASSISTANT",
        status: MessageStatus.COMPLETE,
        model,
        content: fullText,
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
          });

          try {
            await streamAIResponse(stream, {
              sessionId,
              model: resumableMessage.model,
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
