import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { EmptyBorder } from "./border";
import { StatusBar } from "./status-bar";
import { CommandMenu } from "./command-menu";
import { useCallback, useEffect, useRef } from "react";
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
  const renderer = useRenderer();
  const toast = useToast();
  const dialog = useDialog();
  const { isTopLayer, setResponder } = useKeyboardLayer();
  const { colors } = useTheme();
  const navigate = useNavigate();

  const {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    resolveCommand,
    setSelectedIndex,
  } = useCommandMenu();

  // textarea输入变化
  const handleTextareaContentChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    handleContentChange(textarea.plainText);
  }, []);

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

  onSubmitRef.current = () => {
    if (disabled) return;

    // 执行命令
    if (showCommandMenu) {
      const command = resolveCommand(selectedIndex);
      handleCommand(command);
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
          {/* 文本输入区域 */}
          <textarea
            ref={textareaRef}
            focused={!disabled && !isTopLayer("dialog")}
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
