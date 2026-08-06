<h1 align="center">
  <code>&gt;_</code>
  <br />
  Pikkocode
</h1>

<p align="center">
  一个使用 Bun、React 和 OpenTUI 构建的终端 AI 编程助手，支持多模型对话、代码分析、本地工具调用与项目文件修改。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-Runtime-FBF0DF?logo=bun&logoColor=black" alt="Bun Runtime" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black" alt="React 19.2" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/OpenTUI-0.4-7C3AED" alt="OpenTUI 0.4" />
  <img src="https://img.shields.io/badge/Hono-4.12-E36002?logo=hono&logoColor=white" alt="Hono 4.12" />
  <img src="https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL with Prisma" />
</p>

项目目前提供两种工作模式：

- **Build**：分析代码并直接实现修改，可读取、创建、编辑文件和执行 Shell 命令。
- **Plan**：只读分析与方案设计，只能读取、列出、搜索项目文件。

## 功能

- 终端原生的流式对话界面
- Build / Plan 模式快速切换
- 支持 OpenAI 与 Anthropic 多个模型
- `@文件路径` 自动补全
- `/` 命令菜单、历史会话与主题切换
- 基于 Clerk OAuth 2.0 + PKCE 的浏览器登录
- PostgreSQL 会话持久化
- 基于 Polar credits 的充值、余额校验和用量计费
- 本地工具调用结果自动回传给模型并继续生成

## 技术栈

- [Bun](https://bun.sh/)：运行时、包管理与构建工具
- [React](https://react.dev/) + [OpenTUI](https://github.com/sst/opentui)：终端 UI
- [AI SDK](https://ai-sdk.dev/)：模型流式响应与工具调用
- [Hono](https://hono.dev/)：HTTP API
- [Prisma](https://www.prisma.io/) + PostgreSQL：数据访问与会话存储
- [Clerk](https://clerk.com/)：OAuth 鉴权
- [Polar](https://polar.sh/)：充值、余额和用量计费
- [Sentry](https://sentry.io/)：服务端错误与日志监控

## 项目结构

```text
.
├── packages/
│   ├── cli/       # OpenTUI 客户端、本地工具执行、OAuth 登录
│   ├── server/    # Hono API、模型调用、鉴权和计费
│   ├── database/  # Prisma schema、客户端和生成代码
│   └── shared/    # 前后端共享的模型配置、Schema 和工具契约
├── package.json
└── bun.lock
```

一次对话的主要流程如下：

1. CLI 创建或加载会话，并向 `POST /chat` 发送消息、模式和模型。
2. 服务端验证 Clerk token 与 Polar credits，从 PostgreSQL 读取历史消息。
3. 服务端调用所选模型，并通过 SSE 将文本与工具调用流式返回 CLI。
4. CLI 在启动命令时所在的目录中执行本地工具，然后把结果发回模型。
5. 回复完成后，服务端保存消息，并按照 token 用量向 Polar 上报 credits 消耗。

## 本地开发

### 前置要求

- [Bun](https://bun.sh/) 最新稳定版
- PostgreSQL 数据库
- Clerk OAuth 应用
- Polar sandbox 或 production 项目
- 至少一个模型服务商的 API Key（OpenAI 或 Anthropic）
- 系统中可用的 `bash` 和 `grep`

### 1. 安装依赖

```bash
bun install
```

### 2. 配置环境变量

复制示例配置：

```bash
cp .env.example .env
```

按实际环境填写 `.env`：

| 变量                     | 用途                                                         | 是否必需              |
| ------------------------ | ------------------------------------------------------------ | --------------------- |
| `API_URL`                | CLI 访问的服务端地址；未设置时默认为 `http://localhost:3000` | 否                    |
| `DATABASE_URL`           | PostgreSQL 连接字符串                                        | 是                    |
| `OPENAI_API_KEY`         | OpenAI 模型访问密钥                                          | 使用 OpenAI 模型时    |
| `ANTHROPIC_API_KEY`      | Anthropic 模型访问密钥                                       | 使用 Anthropic 模型时 |
| `CLERK_FRONTEND_API`     | Clerk Frontend API 地址，供 CLI 发起 OAuth                   | 是                    |
| `CLERK_OAUTH_CLIENT_ID`  | Clerk OAuth 应用 Client ID                                   | 是                    |
| `CLERK_PUBLISHABLE_KEY`  | Clerk Publishable Key                                        | 是                    |
| `CLERK_SECRET_KEY`       | Clerk Secret Key，仅服务端使用                               | 是                    |
| `POLAR_ACCESS_TOKEN`     | Polar API Access Token                                       | 是                    |
| `POLAR_PRODUCT_ID`       | 充值使用的 Polar Product ID                                  | 是                    |
| `POLAR_CREDITS_METER_ID` | credits 余额对应的 Polar Meter ID                            | 是                    |
| `POLAR_SERVER`           | `sandbox` 或 `production`，默认 `sandbox`                    | 否                    |

Clerk OAuth 应用的回调地址需要配置为：

```text
${API_URL}/auth/callback
```

不要将 `.env` 或任何真实密钥提交到版本库。

### 3. 初始化数据库

生成 Prisma Client，并将当前 schema 同步到数据库：

```bash
bun run --cwd packages/database db:generate
cd packages/database
bunx prisma db push
cd ../..
```

数据库目前只包含 `Session` 模型，用于保存用户的会话标题、消息和时间信息。

### 4. 启动开发环境

分别打开两个终端：

```bash
# 终端 1：API 服务，默认监听 3000 端口
bun run dev:server
```

```bash
# 终端 2：终端客户端
bun run dev:cli
```

开发模式下，本地工具以启动 CLI 时的当前目录为项目目录。直接在仓库根目录运行 `dev:cli` 时，Pikkocode 操作的就是本仓库。

## 安装本地 CLI

构建并链接 `pikkocode` 命令：

```bash
bun run link:cli
```

之后可以在希望 AI 操作的项目目录中启动：

```bash
cd /path/to/your/project
pikkocode
```

## 使用方式

首次使用时输入 `/login`，浏览器完成授权后 token 会保存在 `~/.pikkocode/auth.json`。该目录和文件分别使用 `0700`、`0600` 权限创建。

常用命令：

| 命令       | 说明                    |
| ---------- | ----------------------- |
| `/new`     | 开始新对话              |
| `/agent`   | 选择 Build 或 Plan 模式 |
| `/model`   | 切换模型                |
| `/session` | 搜索并打开历史会话      |
| `/theme`   | 切换终端主题            |
| `/login`   | 在浏览器中登录          |
| `/logout`  | 清除本地登录信息        |
| `/upgrade` | 打开 Polar 充值页面     |
| `/usage`   | 打开 Polar 账单页面     |
| `/exit`    | 退出程序                |

键盘操作：

| 按键            | 说明                                 |
| --------------- | ------------------------------------ |
| `Enter`         | 发送消息或确认菜单选项               |
| `Shift + Enter` | 输入换行                             |
| `Tab`           | 在 Build / Plan 模式之间切换         |
| `Esc`           | 关闭菜单；生成过程中用于中断响应     |
| `Ctrl + C`      | 依次清空输入、关闭当前浮层或退出程序 |
| `↑` / `↓`       | 选择命令、文件或对话列表项           |

在输入框中键入 `@` 可搜索当前项目中的文件和目录；键入 `/` 可打开命令菜单。

## 支持的模型

默认模型为 `gpt-5.4`。当前共享配置中包含：

- Anthropic：`claude-sonnet-4.6`、`claude-haiku-4.6`、`claude-opus-4.6`
- OpenAI：`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.4-nano`

模型列表、提供商和计费单价统一维护在 `packages/shared/src/models.ts`。

## 常用脚本

| 命令                                          | 说明                              |
| --------------------------------------------- | --------------------------------- |
| `bun run dev:cli`                             | 监听变更并运行 CLI                |
| `bun run dev:server`                          | 热重载运行 API 服务               |
| `bun run build:cli`                           | 将 CLI 构建到 `packages/cli/dist` |
| `bun run link:cli`                            | 构建并通过 Bun 链接本地命令       |
| `bun run --cwd packages/database db:generate` | 生成 Prisma Client                |

服务端可单独构建：

```bash
bun run --cwd packages/server build
```

## API 概览

| 路径                     | 说明                              |
| ------------------------ | --------------------------------- |
| `GET /sessions`          | 获取当前用户的会话列表            |
| `GET /sessions/:id`      | 获取指定会话与历史消息            |
| `POST /sessions`         | 创建会话，需要可用 credits        |
| `POST /chat`             | 发起流式对话，需要可用 credits    |
| `GET /auth/callback`     | 将 Clerk OAuth 回调转发到本地 CLI |
| `POST /billing/checkout` | 创建 Polar 充值链接               |
| `POST /billing/portal`   | 创建 Polar 客户门户链接           |
