import { SUPPORTED_CHAT_MODELS } from "@cli-coding-agent/shared";
import {
  AgentsDialogContent,
  ModelsDialogContent,
  SessionsDialogContent,
  ThemeDialogContent,
} from "../dialogs";
import type { Command } from "./type";

import { performLogin } from "../../lib/oauth";
import { clearAuth } from "../../lib/auth";

import { openUpgradeCheckout, openBillingPortal } from "../../lib/upgrade";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "开始新对话",
    value: "/new",
    action: (ctx) => {
      ctx.navigate("/");
    },
  },
  {
    name: "agent",
    description: "切换智能体",
    value: "/agent",
    action: (ctx) => {
      ctx.dialog.open({
        title: "请选择智能体",
        children: (
          <AgentsDialogContent
            currentMode={ctx.mode}
            onSelectMode={ctx.setMode}
          />
        ),
      });
    },
  },
  {
    name: "model",
    description: "选择用于对话的 AI 模型",
    value: "/model",
    action: (ctx) => {
      ctx.dialog.open({
        title: "请选择模型",
        children: (
          <ModelsDialogContent
            models={SUPPORTED_CHAT_MODELS.map((m) => m.id)}
            onSelectModel={ctx.setModel}
          />
        ),
      });
    },
  },
  {
    name: "session",
    description: "浏览历史会话",
    value: "/session",
    action: (ctx) => {
      ctx.dialog.open({
        title: "选择会话",
        children: <SessionsDialogContent />,
      });
    },
  },
  {
    name: "theme",
    description: "切换颜色主题",
    value: "/theme",
    action: (ctx) => {
      ctx.dialog.open({
        title: "选择颜色主题",
        children: <ThemeDialogContent />,
      });
    },
  },
  {
    name: "login",
    description: "在浏览器中登录",
    value: "/login",
    action: async (ctx) => {
      ctx.toast.show({ message: "正在打开浏览器登录..." });

      try {
        await performLogin();
        ctx.toast.show({ variant: "success", message: "登录成功~" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Sign in failed or timed out";

        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "logout",
    description: "退出登录",
    value: "/logout",
    action: (ctx) => {
      clearAuth();
      ctx.toast.show({ message: "已退出登录~" });
    },
  },
  {
    name: "upgrade",
    description: "充值余额",
    value: "/upgrade",
    action: async (ctx) => {
      ctx.toast.show({ message: "正在打开网页..." });

      try {
        await openUpgradeCheckout();
        ctx.toast.show({
          variant: "success",
          message: "已在浏览器中打开充值页面",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法打开充值页面";
        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "usage",
    description: "在浏览器中打开账单页面",
    value: "/usage",
    action: async (ctx) => {
      ctx.toast.show({ message: "正在打开网页..." });

      try {
        await openBillingPortal();
        ctx.toast.show({
          variant: "success",
          message: "已在浏览器中打开账单页面",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "无法打开账单页面";
        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "exit",
    description: "退出应用程序",
    value: "/exit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
