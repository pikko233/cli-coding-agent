import { readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  TextAttributes,
  type KeyBinding,
  type ScrollBoxRenderable,
  type TextareaRenderable,
} from "@opentui/core";
import { EmptyBorder } from "./border";
import { StatusBar } from "./status-bar";
import { CommandMenu } from "./command-menu";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useCommandMenu } from "./command-menu/use-command-menu";
import type { Command } from "./command-menu/type";
import { useToast } from "../providers/toast";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { useDialog } from "../providers/dialog";
import { useTheme } from "../providers/theme";
import { useNavigate } from "react-router";
import { usePromptConfig } from "../providers/prompt-config";
import { Mode } from "@cli-coding-agent/database/enums";

const MAX_VISIBLE_MENTIONS = 8; //  输入 @ 后，下拉列表最多显示 8 个候选文件
const CURRENT_DIRECTORY = process.cwd(); // 当前工作目录，搜索候选文件时以这里为起点
const MAX_FALLBACK_MENTION_CANDIDATES = 32; // 没有精确匹配时，兜底搜索最多取 32 个候选
const MENTION_QUERY_CHARACTER = /[A-Za-z0-9._/-]/; // 合法的文件名匹配字符
const RECURSIVE_MENTION_IGNORE_DIRECTORIES = new Set(["node_modules"]); // 搜索时跳过的目录名单

type MentionMatch = {
  start: number;
  end: number;
  query: string;
};

type MentionCandidate = {
  path: string;
  kind: "file" | "directory";
};

// OpenTUI 的 cursorOffset 是终端列偏移；先取出光标前文本，再转成 JS 字符串下标。
function getCursorCharacterOffset(textarea: TextareaRenderable) {
  return textarea.getTextRange(0, textarea.cursorOffset).length;
}

// JS 字符串下标不能直接赋给 cursorOffset，中文等宽字符需要按终端显示宽度定位。
function setCursorByCharacterOffset(
  textarea: TextareaRenderable,
  text: string,
  characterOffset: number,
) {
  const safeOffset = Math.max(0, Math.min(characterOffset, text.length));
  const linesBeforeCursor = text.slice(0, safeOffset).split("\n");
  const row = linesBeforeCursor.length - 1;
  const currentLine = linesBeforeCursor[row] ?? "";

  textarea.setCursor(row, Bun.stringWidth(currentLine));
}

function isWithinCurrentDirectory(targetPath: string) {
  // 转成相对路径后，排除工作目录之外的路径，避免 @../ 访问上级目录。
  const relativePath = relative(CURRENT_DIRECTORY, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function isMentionCharacter(character: string) {
  // @ 后只把常见的文件路径字符算作查询内容。
  return MENTION_QUERY_CHARACTER.test(character);
}

// 找出光标当前所在的 @文件路径，并返回它在整段输入中的位置。
function findActiveMention(
  text: string,
  characterOffset: number,
): MentionMatch | null {
  // 防止传入的光标位置小于 0 或超过文本末尾。
  const safeOffset = Math.max(0, Math.min(characterOffset, text.length));

  // 先按空白找到光标所在的完整单词。
  let start = safeOffset;
  while (start > 0 && !/\s/.test(text[start - 1]!)) {
    start -= 1;
  }

  // 再向右找到单词结尾，得到光标前后的完整内容。
  let end = safeOffset;
  while (end < text.length && !/\s/.test(text[end]!)) {
    end += 1;
  }

  const token = text.slice(start, end);
  const relativeCursor = safeOffset - start;
  // 如果单词里有多个 @，取离光标最近的一个。
  const mentionStart = token.lastIndexOf("@", relativeCursor);

  // 当前单词中没有可用的 @，说明没有正在输入文件引用。
  if (mentionStart === -1) {
    return null;
  }

  const previousCharacter = token[mentionStart - 1];
  // 避免把邮箱等内容中的 @ 当成文件引用。
  if (previousCharacter && isMentionCharacter(previousCharacter)) {
    return null;
  }

  // 从 @ 后向右扫描，确定文件路径查询的结束位置。
  let mentionEnd = mentionStart + 1;
  while (mentionEnd < token.length && isMentionCharacter(token[mentionEnd]!)) {
    mentionEnd += 1;
  }

  // 光标已经离开 @路径 的范围时，不再显示文件候选。
  if (relativeCursor < mentionStart || relativeCursor > mentionEnd) {
    return null;
  }

  // 返回 @path 的位置和搜索内容
  // start/end 用于选中候选后替换原输入，query 用于搜索文件。
  return {
    start: start + mentionStart,
    end: start + mentionEnd,
    query: token.slice(mentionStart + 1, mentionEnd),
  };
}

async function getMentionCandidates(
  query: string,
): Promise<MentionCandidate[]> {
  // 只支持工作目录内的相对路径。
  const normalizedQuery = query.startsWith("./") ? query.slice(2) : query;
  // 拒绝绝对路径，避免搜索范围离开当前项目。
  if (normalizedQuery.startsWith("/")) {
    return [];
  }

  // 把查询拆成“要读取的目录”和“文件名前缀”两部分。
  const hasTrailingSlash = normalizedQuery.endsWith("/");
  const lashSlashIndex = hasTrailingSlash
    ? normalizedQuery.length - 1
    : normalizedQuery.lastIndexOf("/");

  const directoryPart = hasTrailingSlash
    ? normalizedQuery.slice(0, -1)
    : lashSlashIndex === -1
      ? ""
      : normalizedQuery.slice(0, lashSlashIndex);

  const namePrefix = hasTrailingSlash
    ? ""
    : lashSlashIndex === -1
      ? normalizedQuery
      : normalizedQuery.slice(lashSlashIndex + 1);

  // 将目录转为绝对路径后，再检查它是否仍在当前项目中。
  const absoluteDirectory = resolve(CURRENT_DIRECTORY, directoryPart || ".");
  if (!isWithinCurrentDirectory(absoluteDirectory)) {
    return [];
  }

  try {
    // withFileTypes 可以直接判断每一项是文件还是文件夹。
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const lowercasePrefix = namePrefix.toLowerCase();
    // 只有用户主动输入“.”时才展示隐藏文件。
    const showHiddenEntries = namePrefix.startsWith(".");

    // 优先只匹配用户当前指定目录的直接子项，并让文件夹排在前面。
    const directMatches = entries
      .filter((entry) => showHiddenEntries || !entry.name.startsWith("."))
      .filter((entry) => {
        return lowercasePrefix === "" || entry.name.startsWith(lowercasePrefix);
      })
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      })
      .map((entry) => {
        const path = directoryPart
          ? `${directoryPart}/${entry.name}`
          : entry.name;
        const kind: MentionCandidate["kind"] = entry.isDirectory()
          ? "directory"
          : "file";
        // 文件夹末尾保留 /，方便继续补全下一层路径。
        return {
          path: kind === "directory" ? `${path}/` : path,
          kind,
        };
      });

    // 只有根目录下输入了名称且没有直接结果时，才启动递归兜底搜索。
    if (directMatches.length > 0 || directoryPart !== "" || namePrefix === "") {
      return directMatches;
    }

    const fallbackMatches: MentionCandidate[] = [];
    // 从工作目录向下找同名前缀，跳过隐藏项和体积大的依赖目录。
    const visit = async (
      absoluteDirectory: string,
      directoryPart: string,
    ): Promise<void> => {
      const entries = await readdir(absoluteDirectory, { withFileTypes: true });

      for (const entry of entries) {
        if (!showHiddenEntries && entry.name.startsWith(".")) {
          continue;
        }

        if (
          entry.isDirectory() &&
          RECURSIVE_MENTION_IGNORE_DIRECTORIES.has(entry.name)
        ) {
          continue;
        }

        const path = directoryPart
          ? `${directoryPart}/${entry.name}`
          : entry.name;
        const kind: MentionCandidate["kind"] = entry.isDirectory()
          ? "directory"
          : "file";

        // 递归兜底搜索忽略文件名大小写。
        if (entry.name.toLowerCase().startsWith(lowercasePrefix)) {
          fallbackMatches.push({
            path: kind === "directory" ? `${path}/` : path,
            kind,
          });
          // 达到候选上限后立即结束，避免遍历整个大项目。
          if (fallbackMatches.length >= MAX_FALLBACK_MENTION_CANDIDATES) {
            return;
          }
        }

        // 文件夹继续向下搜索，文件则不再处理。
        if (entry.isDirectory()) {
          await visit(resolve(absoluteDirectory, entry.name), path);
          if (fallbackMatches.length >= MAX_FALLBACK_MENTION_CANDIDATES) {
            return;
          }
        }
      }
    };

    await visit(CURRENT_DIRECTORY, "");
    // 递归结果按完整相对路径排序，保证菜单顺序稳定。
    return fallbackMatches.sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  } catch {
    // 目录不存在或无权读取时，候选列表保持为空。
    return [];
  }
}

type FileMentionMenuProps = {
  candidates: MentionCandidate[];
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  onSelect: (index: number) => void;
  onExecute: (index: number) => void;
};

function FileMentionMenu({
  candidates,
  selectedIndex,
  scrollRef,
  onSelect,
  onExecute,
}: FileMentionMenuProps) {
  const { colors } = useTheme();
  const visibleHeight = Math.min(candidates.length, MAX_VISIBLE_MENTIONS);

  if (candidates.length === 0) {
    return (
      <box paddingX={1}>
        <text attributes={TextAttributes.DIM}>没有匹配的文件或目录</text>
      </box>
    );
  }

  return (
    <scrollbox ref={scrollRef} height={visibleHeight}>
      {candidates.map((candidate, index) => {
        const isSelected = index === selectedIndex;

        return (
          <box
            key={candidate.path}
            flexDirection="row"
            paddingX={1}
            height={1}
            overflow="hidden"
            backgroundColor={isSelected ? colors.selection : undefined}
            onMouseMove={() => onSelect(index)}
            onMouseDown={() => onExecute(index)}
          >
            <box flexGrow={1} flexShrink={1} overflow="hidden">
              <text selectable={false} fg={isSelected ? "black" : "white"}>
                {candidate.path}
              </text>
            </box>

            <box width={8} alignItems="flex-end" flexShrink={0}>
              <text selectable={false} fg={isSelected ? "black" : "gray"}>
                {candidate.kind === "directory" ? "文件夹" : "文件"}
              </text>
            </box>
          </box>
        );
      })}
    </scrollbox>
  );
}

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const TEXTAREA_KEY_BINDING: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "enter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "enter", shift: true, action: "newline" },
];

export const InputBar = ({
  onSubmit,
  disabled = false,
  placeholder = "有什么想问的...例: 请你分析这个项目的架构",
}: Props) => {
  const { mode, toggleMode, setMode, setModel } = usePromptConfig();
  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<() => void>(() => {});
  const activeMentionRef = useRef<MentionMatch | null>(null);
  const mentionScrollRef = useRef<ScrollBoxRenderable | null>(null);

  const renderer = useRenderer();
  const toast = useToast();
  const dialog = useDialog();
  const { isTopLayer, push, pop, setResponder } = useKeyboardLayer();
  const { colors } = useTheme();
  const navigate = useNavigate();

  const [activeMention, setActiveMention] = useState<MentionMatch | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<
    MentionCandidate[]
  >([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  const {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    resolveCommand,
    setSelectedIndex,
  } = useCommandMenu();

  const showMentionMenu = activeMention !== null;

  const closeMentionMenu = useCallback(() => {
    activeMentionRef.current = null;
    setActiveMention(null);
    setMentionCandidates([]);
    pop("mention");
  }, [pop]);

  // 根据输入框当前文字和光标位置，同步 @文件 候选菜单的打开、关闭和选中状态
  const syncMentionMenu = useCallback(
    (text: string, characterOffset: number) => {
      const nextMention = findActiveMention(text, characterOffset);
      const previousMention = activeMentionRef.current;
      const mentionChanged =
        previousMention?.start !== nextMention?.start ||
        previousMention?.end !== nextMention?.end ||
        previousMention?.query !== nextMention?.query;

      if (!nextMention) {
        if (previousMention) {
          closeMentionMenu();
        }
        return;
      }

      activeMentionRef.current = nextMention;
      setActiveMention(nextMention);
      push("mention", () => {
        closeMentionMenu();
        return true;
      });

      if (mentionChanged) {
        setMentionSelectedIndex(0);
        mentionScrollRef.current?.scrollTo(0);
      }
    },
    [closeMentionMenu, push],
  );

  // textarea输入变化
  const handleTextareaContentChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = textarea.plainText;
    handleContentChange(text);
    syncMentionMenu(text, getCursorCharacterOffset(textarea));
  }, [handleContentChange, syncMentionMenu]);

  // 执行命令行语句
  const handleCommand = useCallback(
    (command: Command | undefined) => {
      const textarea = textareaRef.current;
      if (!textarea || !command) return;

      textarea.setText("");

      if (command.action) {
        command.action({
          exit: () => renderer.destroy(),
          toast,
          dialog,
          navigate,
          mode,
          setMode,
          setModel,
        });
      } else {
        textarea.insertText(command.value + " ");
      }
    },
    [renderer, toast, dialog, navigate, mode, toggleMode, setMode, setModel],
  );

  const handleCommandExecute = useCallback(
    (index: number) => {
      const command = resolveCommand(index);
      handleCommand(command);
    },
    [resolveCommand, handleCommand],
  );

  // 向AI Agent发送消息
  const handleSubmit = useCallback(() => {
    if (disabled) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = textarea.plainText.trim();
    if (text.length === 0) return;

    onSubmit(text);
    textarea.setText("");
  }, [disabled, onSubmit]);

  // 确认选中某一行文件路径后，textarea文本值和光标位置也同步发生变化
  const handleMentionExecute = useCallback(
    (index: number) => {
      const textarea = textareaRef.current;
      const mention = activeMentionRef.current;
      const candidate = mentionCandidates[index];

      if (!textarea || !mention || !candidate) return;

      const insertion =
        candidate.kind === "directory" ? candidate.path : `${candidate.path} `;

      const nextText = `${textarea.plainText.slice(0, mention.start)}@${insertion}${textarea.plainText.slice(mention.end)}`;
      const nextCharacterOffset = mention.start + insertion.length + 1;

      textarea.replaceText(nextText);
      setCursorByCharacterOffset(textarea, nextText, nextCharacterOffset);
      syncMentionMenu(nextText, nextCharacterOffset);
    },
    [mentionCandidates, syncMentionMenu],
  );

  const handleTextareaCursorChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    syncMentionMenu(textarea.plainText, getCursorCharacterOffset(textarea));
  }, [syncMentionMenu]);

  onSubmitRef.current = () => {
    if (disabled) return;

    // 执行命令
    if (showCommandMenu) {
      const command = resolveCommand(selectedIndex);
      handleCommand(command);
      return;
    }

    // 插入相关文件路径
    if (showMentionMenu) {
      const candidate = mentionCandidates[mentionSelectedIndex];
      if (candidate) {
        handleMentionExecute(mentionSelectedIndex);
        return;
      }
      closeMentionMenu();
      return;
    }

    // 否则，向AI Agent发送问题请求
    handleSubmit();
  };

  useKeyboard((key) => {
    if (disabled) return;
    if (!isTopLayer("base")) return;
    if (key.name === "tab") {
      key.preventDefault();
      toggleMode();
    }
  });

  // 将textarea的submit事件与onSubmitRef可变容器绑定在一起
  // 当组件重新渲染时，onSubmitRef.current都会指向最新的textarea的submit
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.onSubmit = () => {
      onSubmitRef.current();
    };
  }, []);

  // 页面初始化挂载时，将base压入栈中
  useEffect(() => {
    setResponder("base", () => {
      // 按下ctrl+c时执行以下操作
      if (disabled) return false;

      const textarea = textareaRef.current;
      if (textarea && textarea.plainText.trim()) {
        textarea.setText("");
        return true;
      }

      return false;
    });

    return () => setResponder("base", null);
  }, [disabled, setResponder]);

  // 根据输入框内容，加载相关文件路径
  useEffect(() => {
    if (!activeMention) {
      setMentionCandidates([]);
      return;
    }

    let ignore = false;

    const loadCandidates = async () => {
      const nextCandidates = await getMentionCandidates(activeMention.query);
      if (ignore) return;
      setMentionCandidates(nextCandidates);
      setMentionSelectedIndex((currentIndex) => {
        if (nextCandidates.length === 0) {
          return 0;
        }

        return Math.min(currentIndex, nextCandidates.length - 1);
      });
    };

    void loadCandidates();

    return () => {
      ignore = true;
    };
  }, [activeMention]);

  // 监听 @文件 相关按键
  useKeyboard((key) => {
    if (disabled) return;
    if (!showMentionMenu || !isTopLayer("mention")) return;

    if (key.name === "escape") {
      key.preventDefault();
      closeMentionMenu();
    } else if (key.name === "up") {
      key.preventDefault();
      setMentionSelectedIndex((currentIndex) => {
        const newIndex = Math.max(0, currentIndex - 1);
        const scrollbox = mentionScrollRef.current;

        if (scrollbox && newIndex < scrollbox.scrollTop) {
          scrollbox.scrollTo(newIndex);
        }

        return newIndex;
      });
    } else if (key.name === "down") {
      key.preventDefault();
      setMentionSelectedIndex((currentIndex) => {
        if (mentionCandidates.length === 0) return 0;
        const newIndex = Math.min(
          mentionCandidates.length - 1,
          currentIndex + 1,
        );

        const scrollbox = mentionScrollRef.current;
        if (scrollbox) {
          const visibleEnd =
            scrollbox.scrollTop + scrollbox.viewport.height - 1;
          if (newIndex > visibleEnd) {
            scrollbox.scrollTo(newIndex - scrollbox.viewport.height + 1);
          }
        }

        return newIndex;
      });
    }
  });

  return (
    <box alignItems="center" width="100%">
      {/* 左边框 */}
      <box
        border={["left"]}
        borderColor={mode === Mode.BUILD ? colors.primary : colors.planMode}
        width="100%"
        customBorderChars={{
          ...EmptyBorder,
          vertical: "┃",
          bottomLeft: "╹",
        }}
      >
        {/* 输入框背景 */}
        <box
          position="relative"
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          backgroundColor={colors.surface}
          width="100%"
          gap={1}
        >
          {/* 搜索相关命令提示 */}
          {showCommandMenu && (
            <box
              position="absolute"
              bottom="100%"
              left={0}
              width="100%"
              backgroundColor={colors.surface}
              zIndex={10}
            >
              <CommandMenu
                query={commandQuery}
                selectedIndex={selectedIndex}
                scrollRef={scrollRef}
                onSelect={setSelectedIndex}
                onExecute={handleCommandExecute}
              />
            </box>
          )}
          {/* 输入 @ 后显示相关文件 */}
          {!showCommandMenu && showMentionMenu && (
            <box
              position="absolute"
              bottom="100%"
              left={0}
              width="100%"
              backgroundColor={colors.surface}
              zIndex={10}
            >
              <FileMentionMenu
                candidates={mentionCandidates}
                selectedIndex={mentionSelectedIndex}
                scrollRef={mentionScrollRef}
                onSelect={setMentionSelectedIndex}
                onExecute={handleMentionExecute}
              />
            </box>
          )}
          {/* 文本输入区域 */}
          <textarea
            ref={textareaRef}
            focused={
              !disabled &&
              (isTopLayer("base") ||
                isTopLayer("command") ||
                isTopLayer("mention"))
            }
            keyBindings={TEXTAREA_KEY_BINDING}
            width="100%"
            wrapMode="char"
            placeholder={placeholder}
            onContentChange={handleTextareaContentChange}
          />
          {/* 状态栏 */}
          <StatusBar />
        </box>
      </box>
    </box>
  );
};
