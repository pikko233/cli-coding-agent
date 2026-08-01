import type { Mode } from "@cli-coding-agent/database";
import { createBashTool } from "./bash";
import { createGlobTool } from "./glob";
import { createGrepTool } from "./grep";
import { createEditFileTool } from "./edit-file";
import { createReadFileTool } from "./read-file";
import { createWriteFileTool } from "./write-file";
import { createListDirectoryTool } from "./list-directory";

export function createTools(cwd: string, mode: Mode) {
  // 规划模式只能查看项目，不能修改文件或执行命令。
  const readOnlyTools = {
    readFile: createReadFileTool(cwd),
    listDirectory: createListDirectoryTool(cwd),
    grep: createGrepTool(cwd),
    glob: createGlobTool(cwd),
  };

  if (mode === "PLAN") {
    return readOnlyTools;
  }

  // 构建模式开放所有会改变项目状态的工具。
  return {
    ...readOnlyTools,
    writeFile: createWriteFileTool(cwd),
    editFile: createEditFileTool(cwd),
    bash: createBashTool(cwd),
  };
}
