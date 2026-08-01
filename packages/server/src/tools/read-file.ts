import { resolve, relative, dirname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { tool } from "ai";
import { z } from "zod";

const MAX_FILE_SIZE = 10_000;

export function createReadFileTool(cwd: string) {
  return tool({
    description:
      "Read the contents of a file in the project. Returns the file text, truncated if very large.",
    inputSchema: z.object({
      path: z.string().describe("Relative path to the file to read"),
    }),
    execute: async ({ path }) => {
      const resolved = resolve(cwd, path);
      const rel = relative(cwd, resolved);

      // 拒绝读取项目目录之外的路径。
      if (
        rel.startsWith("..") ||
        (resolve(resolved) !== resolved && rel.startsWith(".."))
      ) {
        return { error: "Path is outside the project directory" };
      }

      if (!resolved.startsWith(cwd)) {
        return {
          error: "Path is outside the project directory",
        };
      }

      try {
        const content = await readFile(resolved, "utf-8");

        // 大文件只返回开头，防止占用过多模型上下文。
        if (content.length > MAX_FILE_SIZE) {
          return {
            content: content.slice(0, MAX_FILE_SIZE),
            truncated: true,
            totalLength: content.length,
          };
        }

        return {
          content,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          error: `Failed to read file: ${message}`,
        };
      }
    },
  });
}
