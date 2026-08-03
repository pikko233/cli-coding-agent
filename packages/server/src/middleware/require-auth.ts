import { createMiddleware } from "hono/factory";
import { authenticateOAuthRequest } from "../lib/auth";

export type AuthenticatedEnv = {
  Variables: {
    userId: string;
  };
};

export const requireAuth = createMiddleware<AuthenticatedEnv>(
  async (c, next) => {
    try {
      const auth = await authenticateOAuthRequest(c.req.raw);
      if (!auth) {
        return c.json({ error: "未登录，请输入 /login 命令进行登录" }, 401);
      }

      c.set("userId", auth.userId);
      await next();
    } catch {
      return c.json({ error: "未登录，请输入 /login 命令进行登录" }, 401);
    }
  },
);
