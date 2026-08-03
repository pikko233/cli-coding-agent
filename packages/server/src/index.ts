import { Hono } from "hono";
import { sentry } from "@sentry/hono/bun";
import * as Sentry from "@sentry/hono/bun";
import { HTTPException } from "hono/http-exception";
import sessions from "./routes/sessions";
import chat from "./routes/chat";
import auth from "./routes/auth";
import { requireAuth } from "./middleware/require-auth";

const app = new Hono();

app.use(
  sentry(app, {
    dsn: "https://e7c47916c53dcbda6185f2af39e9b09f@o4511821557399552.ingest.de.sentry.io/4511821579944016",
    tracesSampleRate: 1.0,
    enableLogs: true,
    dataCollection: {
      // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
      // https://docs.sentry.io/platforms/javascript/guides/hono/configuration/options/#dataCollection
      // userInfo: false,
      // httpBodies: [],
    },
  }),
);

app.get("/debug-sentry", () => {
  // Send a log before throwing the error
  Sentry.logger.info("User triggered test error", {
    action: "test_error_endpoint",
  });
  // Send a test metric before throwing the error
  Sentry.metrics.count("test_counter", 1);
  throw new Error("My first Sentry error!");
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    Sentry.logger.warn("Handled HTTP error", {
      status: error.status,
      message: error.message || "http请求失败",
      path: c.req.path,
      method: c.req.method,
    });

    return c.json(
      {
        error: error.message || "请求失败",
      },
      error.status,
    );
  }

  Sentry.logger.error("Handled server error", {
    message: error instanceof Error ? error.message : "未知异常错误",
    path: c.req.path,
    method: c.req.method,
  });

  return c.json({ error: "Internal server error" }, 500);
});

app.use("/sessions/*", requireAuth);
app.use("/chat/*", requireAuth);

const routes = app
  .route("/sessions", sessions)
  .route("/chat", chat)
  .route("/auth", auth);

export type AppType = typeof routes;

export default { port: 3000, fetch: app.fetch, idleTimeout: 255 };
