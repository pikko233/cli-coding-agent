import open from "open";
import { saveAuth } from "./auth";

// 浏览器登录超过 5 分钟仍未回调时，自动结束本次登录。
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

type OAuthState = {
  nonce: string; // 用于确认回调属于本次登录
  port: number; // CLI 临时回调服务监听的端口
};

// OAuth 参数使用不带填充符的 URL 安全 Base64。
function toBase64Url(input: Uint8Array | string) {
  return Buffer.from(input).toString("base64url");
}

// 根据随机 verifier 生成 PKCE challenge，防止授权码被截获后直接使用。
async function createPkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return toBase64Url(new Uint8Array(digest));
}

function encodeState(state: OAuthState) {
  return toBase64Url(JSON.stringify(state));
}

function decodeState(state: string) {
  // 只解析 state 的主体部分。
  const [encoded] = state.split(".");
  if (!encoded) {
    throw new Error("Invalid state");
  }

  return JSON.parse(Buffer.from(encoded, "base64url").toString()) as OAuthState;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function performLogin() {
  // Clerk 负责用户授权，API 服务负责把浏览器回调转发给本地 CLI。
  const clerkFrontendApi = process.env.CLERK_FRONTEND_API;
  const clientId = process.env.CLERK_OAUTH_CLIENT_ID;
  const apiUrl = process.env.API_URL ?? "http://localhost:3000";

  if (!clerkFrontendApi) throw new Error("CLERK_FRONTEND_API not set");
  if (!clientId) throw new Error("CLERK_OAUTH_CLIENT_ID not set");

  // nonce 校验登录请求，PKCE verifier 用于稍后安全地交换 token。
  const nonce = crypto.randomUUID();
  const codeVerifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = await createPkceChallenge(codeVerifier);

  let settled = false;

  // Promise 会一直等待浏览器登录成功、失败或超时。
  return new Promise<{ token: string }>((resolve, reject) => {
    // port: 0 让系统自动选择一个空闲端口接收最终回调。
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);

        // 临时服务只处理 OAuth 回调。
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 });
        }

        const error = url.searchParams.get("error");

        // 用户取消登录或 OAuth 服务拒绝授权时，直接结束流程。
        if (error) {
          const msg = url.searchParams.get("error_description") ?? error;
          settled = true;
          reject(new Error(msg));
          setTimeout(() => server.stop(), 500);
          return new Response(`Authentication failed: ${msg}`, { status: 400 });
        }

        // code 用来换 token，state 用来确认回调没有被伪造。
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code || !state) {
          settled = true;
          reject(new Error("Missing code or state"));
          setTimeout(() => server.stop(), 500);
          return new Response("Bad request", { status: 400 });
        }

        // state 中的 nonce 必须与登录开始时生成的一致。
        try {
          const payload = decodeState(state);

          if (payload.nonce !== nonce) throw new Error("State mismatch");
        } catch (err) {
          settled = true;
          reject(err);
          setTimeout(() => server.stop(), 500);
          return new Response("Invalid state", { status: 400 });
        }

        try {
          // 携带同一个 redirectUri 和 PKCE verifier，用授权码换取 Clerk token。
          const redirectUri = `${apiUrl}/auth/callback`;

          const tokenRes = await fetch(`${clerkFrontendApi}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              client_id: clientId,
              code_verifier: codeVerifier,
            }),
          });

          if (!tokenRes.ok) {
            const details = await tokenRes.text();
            throw new Error(details || "Failed to exchange authorization code");
          }

          const tokenData = (await tokenRes.json()) as { access_token: string };

          // 登录成功后将 token 保存到本机，供之后的 API 请求使用。
          settled = true;
          saveAuth({ token: tokenData.access_token });
          resolve({ token: tokenData.access_token });
          // 稍后关闭服务，先给浏览器留出接收响应的时间。
          setTimeout(() => server.stop(), 500);
          return new Response(
            "Authenticated! You can close this tab.(登录成功！现在你可以关掉这个页面了)",
          );
        } catch (err) {
          settled = true;
          reject(err);
          const message = getErrorMessage(err);
          setTimeout(() => server.stop(), 500);
          return new Response(`Authentication failed: ${message}`, {
            status: 400,
          });
        }
      },
    });

    // 把本地端口放进 state，供 API 回调把浏览器转发回这个 CLI 进程。
    const port = server.port;
    if (typeof port !== "number") {
      server.stop();
      reject(new Error("Failed to start callback server"));
      return;
    }

    const state = encodeState({ port, nonce });
    const redirectUri = `${apiUrl}/auth/callback`;

    // 组装 Authorization Code + PKCE 授权地址。
    const authorizeUrl = new URL(`${clerkFrontendApi}/oauth/authorize`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "openid email profile");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("prompt", "login");
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    // 使用系统默认浏览器打开登录页面。
    void open(authorizeUrl.toString());

    // 超时后关闭临时服务，避免端口一直被占用。
    setTimeout(() => {
      if (!settled) {
        settled = true;
        server.stop();
        reject(new Error("Login timed out"));
      }
    }, LOGIN_TIMEOUT_MS);
  });
}
