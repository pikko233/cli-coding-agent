import { createMiddleware } from "hono/factory";
import type { AuthenticatedEnv } from "./require-auth";
import { getAvailableCreditsBalance } from "../lib/polar";

export const requireCreditsBalance = createMiddleware<AuthenticatedEnv>(
  async (c, next) => {
    try {
      const userId = c.get("userId");
      const creditsBalance = await getAvailableCreditsBalance(userId);

      if (creditsBalance <= 0) {
        return c.json(
          {
            error: "余额不足，请输入 /upgrade 命令进行充值。",
          },
          402,
        );
      }
      await next();
    } catch {
      return c.json(
        { error: "暂时无法查询余额，请稍后重试。" },
        503,
      );
    }
  },
);
