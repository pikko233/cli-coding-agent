import type { Command } from "./type";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation(开始一段新对话)",
    value: "/new",
  },
  {
    name: "agent",
    description: "Switch agent(切换智能体)",
    value: "/agent",
  },
  {
    name: "model",
    description: "Select a AI model for generation(选择AI模型用于对话)",
    value: "/model",
  },
  {
    name: "session",
    description: "Browse past sessions(浏览过往会话记录)",
    value: "/session",
  },
  {
    name: "theme",
    description: "Change color theme(更改颜色主题样式)",
    value: "/theme",
  },
  {
    name: "logout",
    description: "Sign out of your account(退出登录)",
    value: "/logout",
  },
  {
    name: "upgrade",
    description: "Buy more credits(充值余额)",
    value: "/upgrade",
  },
  {
    name: "usage",
    description: "Open billing portal in your browser(在浏览器端打开账单页面)",
    value: "/usage",
  },
  {
    name: "quit",
    description: "Quit the application(退出应用程序)",
    value: "/quit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
