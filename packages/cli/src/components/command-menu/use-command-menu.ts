import type { ScrollBoxRenderable } from "@opentui/core";
import { useMemo, useRef, useState, type RefObject } from "react";
import type { Command } from "./type";
import { getFilteredCommands } from "./filter-commands";
import { useKeyboard } from "@opentui/react";
import { useKeyboardLayer } from "../../providers/keyboard-layer";

type UseCommandMenuReturn = {
  showCommandMenu: boolean;
  commandQuery: string;
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  handleContentChange: (text: string) => void;
  resolveCommand: (index: number) => Command | undefined;
  setSelectedIndex: (index: number) => void;
};

export const useCommandMenu = (): UseCommandMenuReturn => {
  const [textValue, setTextValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { push, pop, isTopLayer } = useKeyboardLayer();

  const commandQuery =
    showCommandMenu && textValue.startsWith("/") ? textValue.slice(1) : "";

  // 缓存搜索过滤的命令结果
  const filteredCommands = useMemo(
    () => getFilteredCommands(commandQuery),
    [commandQuery],
  );

  // 关闭命令行菜单
  const close = () => {
    setShowCommandMenu(false);
    pop("command");
  };

  // 当输入内容发生改变
  const handleContentChange = (text: string) => {
    setTextValue(text);
    setSelectedIndex(0);

    const scrollBox = scrollRef.current;
    if (scrollBox) {
      // 滚动至列表顶部
      scrollBox.scrollTo(0);
    }

    const prefix = text.startsWith("/") ? text.slice(1) : null;
    if (prefix !== null && !prefix.includes(" ")) {
      setShowCommandMenu(true);
      // 当命令菜单显示时，将当前页面压入栈
      push("command", () => {
        // 按下ctrl+c执行以下操作
        close();
        return true;
      });
    } else {
      close();
    }
  };

  // 执行具体某一条命令
  const resolveCommand = (index: number): Command | undefined => {
    const command = filteredCommands[index];
    if (command) {
      close();
    }
    return command;
  };

  useKeyboard((key) => {
    if (!showCommandMenu || !isTopLayer("command")) return;

    if (key.name === "escape") {
      key.preventDefault();
      close();
    } else if (key.name === "up") {
      // 上箭头
      key.preventDefault();
      setSelectedIndex((i: number) => {
        const newIndex = Math.max(0, i - 1);

        const scrollBox = scrollRef.current;
        if (scrollBox && newIndex < scrollBox.scrollTop) {
          scrollBox.scrollTo(newIndex);
        }
        return newIndex;
      });
    } else if (key.name === "down") {
      // 下箭头
      key.preventDefault();
      setSelectedIndex((i: number) => {
        if (filteredCommands.length === 0) return 0;

        const newIndex = Math.min(filteredCommands.length - 1, i + 1);

        const scrollBox = scrollRef.current;
        if (scrollBox) {
          // 当前视口高度最后一行命令的index索引
          const visibleEnd =
            scrollBox.scrollTop + scrollBox.viewport.height - 1;

          if (newIndex > visibleEnd) {
            scrollBox.scrollTo(newIndex - visibleEnd + scrollBox.scrollTop);
          }
        }
        return newIndex;
      });
    }
  });

  return {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    resolveCommand,
    setSelectedIndex,
  };
};
