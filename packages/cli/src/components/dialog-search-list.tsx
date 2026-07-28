import {
  TextAttributes,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { useKeyboard } from "@opentui/react";
import { useTheme } from "../providers/theme";

const MAX_VISIBLE_ITEMS = 6;

type DialogSearchListProps<T> = {
  items: T[];
  onSelect: (item: T) => void;
  onHighlight?: (item: T) => void;
  filterFn: (item: T, query: string) => boolean;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  getKey: (item: T) => string;
  placeholder?: string;
  emptyText?: string;
};

export function DialogSearchList<T>({
  items,
  onSelect,
  onHighlight,
  filterFn,
  renderItem,
  getKey,
  placeholder = "搜索",
  emptyText = "暂无结果",
}: DialogSearchListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<InputRenderable>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { isTopLayer } = useKeyboardLayer();
  const { colors } = useTheme();

  // 搜索框输入发生变化
  const handleContentChange = useCallback(() => {
    const text = inputRef.current?.value ?? "";
    setSearchValue(text);
    setSelectedIndex(0); // 选中第一个

    const scrollBox = scrollRef.current;
    if (scrollBox) {
      scrollBox.scrollTo(0); // 滚动至顶部
    }
  }, []);

  const filtered = searchValue
    ? items.filter((item) => filterFn(item, searchValue))
    : items;

  const visibleHeight = Math.min(MAX_VISIBLE_ITEMS, filtered.length);

  useKeyboard((key) => {
    if (!isTopLayer("dialog")) return;

    if (key.name === "return" || key.name === "enter") {
      key.preventDefault();

      const item = filtered[selectedIndex];
      if (item) {
        onSelect(item);
      }
    } else if (key.name === "up") {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);

        const scrollBox = scrollRef.current;
        if (scrollBox && newIndex < scrollBox.scrollTop) {
          scrollBox.scrollTo(newIndex);
        }
        const newItem = filtered[newIndex];
        if (newItem && onHighlight) onHighlight(newItem);
        return newIndex;
      });
    } else if (key.name === "down") {
      setSelectedIndex((i) => {
        const newIndex = Math.min(filtered.length - 1, i + 1);

        const scrollBox = scrollRef.current;

        if (scrollBox) {
          const visibleEnd =
            scrollBox.scrollTop + scrollBox.viewport.height - 1;

          if (newIndex > visibleEnd) {
            scrollBox.scrollTo(newIndex - visibleEnd + scrollBox.scrollTop);
          }
        }
        const newItem = filtered[newIndex];
        if (newItem && onHighlight) onHighlight(newItem);

        return newIndex;
      });
    }
  });

  return (
    <box flexDirection="column" gap={1}>
      {/* 搜索框 */}
      <input
        ref={inputRef}
        onContentChange={handleContentChange}
        placeholder={placeholder}
        focused
      />
      {/* 搜索列表 */}
      {filtered.length === 0 ? (
        <text attributes={TextAttributes.DIM}>{emptyText}</text>
      ) : (
        <scrollbox ref={scrollRef} height={visibleHeight}>
          {filtered.map((item, i) => {
            const isSelected = i === selectedIndex;

            return (
              <box
                key={getKey(item)}
                flexDirection="row"
                height={1}
                overflow="hidden"
                backgroundColor={isSelected ? colors.selection : undefined}
                onMouseMove={() => {
                  setSelectedIndex(i);
                  if (onHighlight) onHighlight(item);
                }}
                onMouseDown={() => onSelect(item)}
              >
                {renderItem(item, isSelected)}
              </box>
            );
          })}
        </scrollbox>
      )}
    </box>
  );
}
