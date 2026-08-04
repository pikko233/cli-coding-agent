import * as Sentry from "@sentry/hono/bun";
import { findSupportedChatModel } from "@cli-coding-agent/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@cli-coding-agent/database/client";
import { Role, Mode, MessageStatus } from "@cli-coding-agent/database/enums";
import type { AuthenticatedEnv } from "../middleware/require-auth";
import { isSupportedChatModel } from "../lib/models";
import { requireCreditsBalance } from "../middleware/require-credits-balance";

const createSessionSchema = z.object({
  title: z.string(),
  cwd: z.string().optional(),
  initialMessage: z
    .object({
      role: z.enum(Role),
      content: z.string(),
      mode: z.enum(Mode),
      model: z.string().refine(isSupportedChatModel, "暂不支持该模型"),
    })
    .optional(),
});

const createSessionValidator = zValidator(
  "json",
  createSessionSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ error: "新建会话参数错误" }, 400);
    }
  },
);

const app = new Hono<AuthenticatedEnv>()
  .get("/", async (c) => {
    const userId = c.get("userId");

    const sessions = await db.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });

    Sentry.logger.info("会话列表", {
      count: sessions.length,
    });

    return c.json(sessions);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");

    const session = await db.session.findUnique({
      where: { id, userId },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!session) {
      Sentry.logger.warn("会话不存在", {
        sessionId: id,
        userId: userId,
      });

      return c.json(
        {
          error: "会话不存在",
        },
        404,
      );
    }

    Sentry.logger.info("会话加载成功", {
      sessionId: session.id,
      messageCount: session.messages.length,
    });

    return c.json(session);
  })
  .post("/", requireCreditsBalance, createSessionValidator, async (c) => {
    const userId = c.get("userId");

    const { initialMessage, ...data } = c.req.valid("json");

    const session = await db.session.create({
      data: {
        ...data,
        userId: userId,
        ...(initialMessage && {
          messages: {
            create: {
              ...initialMessage,
              status: MessageStatus.COMPLETE,
            },
          },
        }),
      },
      include: {
        messages: true,
      },
    });

    Sentry.logger.info("会话创建成功", {
      sessionId: session.id,
    });

    return c.json(session, 201);
  });

export default app;
