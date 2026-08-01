import { SUPPORTED_CHAT_MODELS } from "@cli-coding-agent/shared";
import {
  AgentsDialogContent,
  ModelsDialogContent,
  SessionsDialogContent,
  ThemeDialogContent,
} from "../dialogs";
import type { Command } from "./type";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation(开始新对话)",
    value: "/new",
    action: (ctx) => {
      ctx.navigate("/");
    },
  },
  {
    name: "agent",
    description: "Switch agent(切换智能体)",
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
    description: "Select an AI model(选择AI模型用于对话)",
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
    description: "Browse past sessions(浏览过往会话记录)",
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
    description: "Change color theme(切换颜色主题)",
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
    description: "Sign in with your browser(打开浏览器登录)",
    value: "/login",
    action: (ctx) => {
      ctx.toast.show({ message: "正在打开浏览器..." });
    },
  },
  {
    name: "logout",
    description: "Sign out of your account(退出登录)",
    value: "/logout",
    action: (ctx) => {
      ctx.toast.show({ message: "已退出登录~" });
    },
  },
  {
    name: "upgrade",
    description: "Buy more credits(充值余额)",
    value: "/upgrade",
    action: (ctx) => {
      ctx.toast.show({ message: "正在打开网页..." });
    },
  },
  {
    name: "usage",
    description: "Open billing portal in your browser(在浏览器端打开账单)",
    value: "/usage",
    action: (ctx) => {
      ctx.toast.show({ message: "正在打开网页..." });
    },
  },
  {
    name: "exit",
    description: "Exit the application(退出应用程序)",
    value: "/exit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
