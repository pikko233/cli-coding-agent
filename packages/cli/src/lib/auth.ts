import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type AuthData = {
  token: string;
};

const AUTH_DIR = join(homedir(), ".pikkocode");
const AUTH_FILE = join(AUTH_DIR, "auth.json");

export function getAuth(): AuthData | null {
  try {
    const data = readFileSync(AUTH_FILE, "utf-8");
    const parsed = JSON.parse(data) as Partial<AuthData>;
    return typeof parsed.token === "string" ? { token: parsed.token } : null;
  } catch {
    return null;
  }
}

export function saveAuth(data: AuthData) {
  if (!existsSync(AUTH_DIR)) {
    // 创建为仅token所有者才有读、写以及执行的权限，其他用户无读写权限
    mkdirSync(AUTH_DIR, { mode: 0o700 }); // 私有目录
  }
  writeFileSync(AUTH_FILE, JSON.stringify(data), { mode: 0o600 }); // 私有文件
}

export function clearAuth() {
  if (existsSync(AUTH_FILE)) {
    unlinkSync(AUTH_FILE);
  }
}
