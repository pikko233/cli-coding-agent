import { useState, useRef, useCallback, useEffect } from "react";
import { EventSourceParserStream } from "eventsource-parser/stream";
import prettyMs from "pretty-ms";
import type { ClientResponse } from "hono/client";
import { apiClient } from "../lib/api-client";
import { getErrorMessage } from "../lib/http-errors";
import type { Mode, Role } from "@cli-coding-agent/database/enums";
import {
  chatStreamEventSchema,
  type SupportedChatModelId,
} from "@cli-coding-agent/shared";

export type ClientToolCallPart = {
  type: "tool-call";
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "calling" | "done";
};

export type ClientMessagePart =
  | { type: "reasoning"; text: string }
  | ClientToolCallPart
  | { type: "text"; text: string };

export type Message =
  | {
      id: string;
      role: "user";
      mode: Mode;
      content: string;
      model: SupportedChatModelId;
    }
  | {
      id: string;
      role: "assistant";
      mode: Mode;
      content: string;
      model: SupportedChatModelId;
      parts: ClientMessagePart[];
      duration?: string;
      interrupted?: boolean;
    }
  | { id: string; role: "error"; content: string };

type StreamingState =
  | { status: "idle" }
  | {
      // 正在生成的内容单独存放，完成后才会加入 messages。
      status: "streaming";
      parts: ClientMessagePart[];
      mode: Mode;
      model: SupportedChatModelId;
    };

// 当前请求的可变信息；放在 ref 中可供异步流随时读取。
type ActiveStream = {
  requestId: string;
  controller: AbortController;
  mode: Mode;
  model: SupportedChatModelId;
  parts: ClientMessagePart[];
  interruptedCaptured: boolean;
};

type SubmitParams = {
  userText: string;
  mode: Mode;
  model: SupportedChatModelId;
};

type RunStreamParams = {
  mode: Mode;
  model: SupportedChatModelId;
  // submit 和 resume 传入各自的请求方式，共用同一套流处理逻辑。
  request: (controller: AbortController) => Promise<ClientResponse<unknown>>;
};

export function useChat(sessionId: string, initialMessages: Message[]) {
  // messages 保存已完成的消息，streaming 保存 AI 正在生成的临时回复。
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streaming, setStreaming] = useState<StreamingState>({
    status: "idle",
  });

  // 同一时间只认一个活动请求，旧请求返回的数据会被忽略。
  const activeStreamRef = useRef<ActiveStream | null>(null);

  const updateMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setMessages((prev) => updater(prev));
    },
    [],
  );

  // 只处理当前请求的数据，防止已经过期的请求继续修改页面。
  const isActiveRequest = useCallback((requestId: string) => {
    return activeStreamRef.current?.requestId === requestId;
  }, []);

  // 把刚收到的文本片段更新到页面上的临时回复。
  const emitParts = useCallback(
    (requestId: string, parts: ClientMessagePart[]) => {
      if (!isActiveRequest(requestId)) return;

      // 创建新数组，让 React 能识别到流式内容发生了变化。
      const snapshots = [...parts];
      const activeStream = activeStreamRef.current;
      if (!activeStream) return;

      activeStream.parts = snapshots;

      setStreaming({
        status: "streaming",
        parts: snapshots,
        mode: activeStream.mode,
        model: activeStream.model,
      });
    },
    [isActiveRequest],
  );

  // 当前请求结束后，清除临时回复状态。
  const clearStream = useCallback(
    (requestId: string) => {
      if (!isActiveRequest(requestId)) return;

      activeStreamRef.current = null;

      setStreaming({
        status: "idle",
      });
    },
    [isActiveRequest],
  );

  // 捕获中断的消息
  const captureInterruptedMessage = useCallback(
    (activeStream: ActiveStream) => {
      // 如果AI消息已中断或者消息片段为空
      if (activeStream.interruptedCaptured || activeStream.parts.length === 0) {
        return;
      }

      //
      activeStream.interruptedCaptured = true;
      const fullText = activeStream.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");

      // 将中断的AI消息推给客户端
      updateMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullText,
          mode: activeStream.mode,
          model: activeStream.model,
          parts: activeStream.parts,
          interrupted: true,
        },
      ]);
    },
    [updateMessages],
  );

  // 读取服务端 SSE，并根据事件类型更新聊天消息。
  const handleStream = useCallback(
    async (response: ClientResponse<unknown>, activeStream: ActiveStream) => {
      if (!isActiveRequest(activeStream.requestId)) return;

      // 这里处理会话不存在、参数错误等普通 HTTP 错误。
      if (!response.ok) {
        const message = await getErrorMessage(response);
        updateMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "error",
            content: message,
          },
        ]);
        return;
      }

      const parts: ClientMessagePart[] = [];

      // 将响应字节依次转换为文本和结构化的 SSE 事件。
      const stream = response
        .body!.pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream());

      // 服务端每推送一个事件，这里就处理一次。
      for await (const { data } of stream) {
        if (!isActiveRequest(activeStream.requestId)) return;

        let event;

        try {
          // 服务端数据属于外部输入，使用共享 schema 做运行时校验。
          event = chatStreamEventSchema.parse(JSON.parse(data));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "stream event格式错误";
          updateMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "error",
              content: message,
            },
          ]);
          break;
        }

        switch (event.type) {
          case "reasoning-delta": {
            const last = parts[parts.length - 1];
            if (last && last.type === "reasoning") {
              parts[parts.length - 1] = {
                type: "reasoning",
                text: last.text + event.text,
              };
            } else {
              parts.push({
                type: "reasoning",
                text: event.text,
              });
            }
            emitParts(activeStream.requestId, parts);
            break;
          }
          case "tool-call":
            parts.push({
              type: "tool-call",
              id: event.toolCallId,
              name: event.toolName,
              args: event.args,
              status: "calling",
            });
            emitParts(activeStream.requestId, parts);
            break;
          case "tool-result": {
            const toolCallPart = parts.find(
              (p): p is ClientToolCallPart =>
                p.type === "tool-call" && p.id === event.toolCallId,
            );
            if (toolCallPart) {
              toolCallPart.result = event.result;
              toolCallPart.status = "done";
            }
            emitParts(activeStream.requestId, parts);
            break;
          }
          case "text-delta": {
            // 合并连续文本片段，实时更新正在生成的回复。
            const last = parts[parts.length - 1];
            if (last && last.type === "text") {
              // last.text += event.text;
              parts[parts.length - 1] = {
                type: "text",
                text: last.text + event.text,
              };
            } else {
              parts.push({ type: "text", text: event.text });
            }
            emitParts(activeStream.requestId, parts);
            break;
          }
          case "done": {
            if (!isActiveRequest(activeStream.requestId)) return;

            // 已生成正式消息，禁止后续再作为中断消息捕获。
            activeStream.interruptedCaptured = true;

            // 收到完成事件后，将临时流式内容转为正式消息。
            const fullText = parts
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("");

            updateMessages((prev) => [
              ...prev,
              {
                id: event.messageId,
                role: "assistant",
                content: fullText,
                mode: activeStream.mode,
                model: activeStream.model,
                duration: prettyMs(event.durationMs),
                parts: [...parts],
              },
            ]);
            break;
          }
          case "error": {
            // AI 生成失败时，将服务端返回的错误显示为一条消息。
            updateMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "error",
                content: event.message,
              },
            ]);
            break;
          }
        }
      }
    },
    [updateMessages, emitParts, isActiveRequest],
  );

  // 启动一次流式请求，并统一处理开始、异常和清理。
  const runStream = useCallback(
    async ({ mode, model, request }: RunStreamParams) => {
      const controller = new AbortController();
      const activeStream: ActiveStream = {
        requestId: crypto.randomUUID(),
        controller,
        mode,
        model,
        parts: [],
        interruptedCaptured: false,
      };

      // 新请求成为唯一的活动请求，并让页面进入生成状态。
      activeStreamRef.current = activeStream;
      setStreaming({
        status: "streaming",
        parts: [],
        mode,
        model,
      });

      try {
        const response = await request(controller);
        await handleStream(response, activeStream);
      } catch (e) {
        // 用户主动停止属于正常流程，不显示错误消息。
        if (
          controller.signal.aborted ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return;
        }

        if (!isActiveRequest(activeStream.requestId)) return;

        const msg = e instanceof Error ? e.message : String(e);

        updateMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "error",
            content: msg,
          },
        ]);
      } finally {
        // 无论成功还是失败，最后都退出生成状态。
        clearStream(activeStream.requestId);
      }
    },
    [clearStream, isActiveRequest, updateMessages, handleStream],
  );

  // 停止进行中的SSE输出
  const stopActiveStream = useCallback(
    (capturePartial: boolean) => {
      const activeStream = activeStreamRef.current;
      if (!activeStream) return;

      // 是否要捕获中断消息
      if (capturePartial) {
        captureInterruptedMessage(activeStream);
      }

      activeStreamRef.current = null;
      setStreaming({ status: "idle" });
      activeStream.controller.abort();
    },
    [captureInterruptedMessage],
  );

  // 恢复数据库中最后一条尚未得到 AI 回复的用户消息。
  const resume = useCallback(
    async ({ mode, model }: Omit<SubmitParams, "userText">) => {
      await runStream({
        mode,
        model,
        request: async (controller) => {
          // resume 接口不会再次保存用户消息，只会重新生成 AI 回复。
          return apiClient.chat[":sessionId"].resume.$post(
            {
              param: {
                sessionId,
              },
            },
            {
              init: {
                signal: controller.signal,
              },
            },
          );
        },
      });
    },
    [runStream, sessionId],
  );

  // 页面首次加载时，如果最后一条是用户消息，就自动恢复一次。
  const hasAutoResumeRef = useRef(false);
  useEffect(() => {
    if (hasAutoResumeRef.current) return;

    const lastMessage = initialMessages[initialMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;
    hasAutoResumeRef.current = true;
    void resume({ mode: lastMessage.mode, model: lastMessage.model });
  }, [initialMessages, resume]);

  // 先在页面显示用户消息，再交给服务端保存并生成 AI 回复。
  const submit = useCallback(
    async ({ userText, mode, model }: SubmitParams) => {
      // 用户发送信息时，中断原来进行中的SSE输出
      stopActiveStream(true);

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: userText,
        mode,
        model,
      };
      updateMessages((prev) => [...prev, userMessage]);

      await runStream({
        mode,
        model,
        request: async (controller) => {
          // 服务端会保存这条用户消息，并用 SSE 返回 AI 回复。
          return apiClient.chat[":sessionId"].$post(
            {
              param: { sessionId },
              json: { content: userText, mode, model },
            },
            { init: { signal: controller.signal } },
          );
        },
      });
    },
    [runStream, sessionId, updateMessages, stopActiveStream],
  );

  // 用户主动中断AI回复, 丢弃已生成的消息
  const abort = useCallback(() => {
    stopActiveStream(false);
  }, [stopActiveStream]);

  // 用户主动中断AI回复, 保留已生成的消息
  const interrupt = useCallback(() => {
    stopActiveStream(true);
  }, [stopActiveStream]);

  return { messages, streaming, submit, abort, interrupt };
}
