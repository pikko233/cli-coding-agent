import { resolve, relative, join } from "path";
import { readdir, stat } from "fs/promises";
import { tool } from "ai";
import { z } from "zod";

export function createListDirectoryTool(cwd: string) {
  return tool({
    description:
      "List files and directories in a project directory. Returns names with type indicators.",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "Relative path to the directory to list (defaults to project root)",
        )
        .default("."),
    }),
    execute: async ({ path }) => {
      const resolved = resolve(cwd, path);

      // 目录操作只允许发生在当前项目内。
      if (!resolved.startsWith(cwd)) {
        return {
          error: "Path is outside the project directory",
        };
      }

      try {
        const entries = await readdir(resolved);
        const results: { name: string; type: "file" | "directory" }[] = [];

        // 隐藏项和依赖目录通常噪声很大，默认不展示。
        for (const entry of entries) {
          if (entry.startsWith(".") || entry === "node_modules") continue;

          try {
            const entryPath = join(resolved, entry);
            const info = await stat(entryPath);

            results.push({
              name: entry,
              type: info.isDirectory() ? "directory" : "file",
            });
          } catch {
            // 单个条目读取失败时跳过，不影响整个目录的结果。
          }
        }

        // 目录排在文件前，同类型按名称排序。
        results.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        return {
          path: relative(cwd, resolved) || ".",
          entries: results,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          error: `Failed to execute command: ${message}`,
        };
      }
    },
  });
}
