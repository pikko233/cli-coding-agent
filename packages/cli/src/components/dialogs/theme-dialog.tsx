import { useCallback, useEffect, useRef } from "react";
import { useDialog } from "../../providers/dialog";
import { useTheme } from "../../providers/theme";
import { THEMES, type Theme } from "../../theme";
import { DialogSearchList } from "../dialog-search-list";

export const ThemeDialogContent = () => {
  const dialog = useDialog();
  const { currentTheme, setTheme } = useTheme();
  const originalThemeRef = useRef(currentTheme);
  const confirmRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!confirmRef.current) {
        setTheme(originalThemeRef.current);
      }
    };
  }, [setTheme]);

  // 回车确认
  const handleSelect = useCallback(
    (theme: Theme) => {
      setTheme(theme);
      confirmRef.current = true;
      dialog.close();
    },
    [setTheme, dialog],
  );

  // 选中，但未回车确认
  const handleHighlight = useCallback(
    (theme: Theme) => {
      setTheme(theme);
    },
    [setTheme],
  );

  return (
    <DialogSearchList
      items={THEMES}
      onSelect={handleSelect}
      onHighlight={handleHighlight}
      filterFn={(t, query) =>
        t.name.toLowerCase().includes(query.toLowerCase())
      }
      renderItem={(theme, isSelected) => (
        <text selectable={false} fg={isSelected ? "black" : "white"}>
          {theme.name === originalThemeRef.current.name ? " • " : "   "}
          {theme.name}
        </text>
      )}
      getKey={(t) => t.name}
      placeholder="搜索主题样式"
      emptyText="暂无相关主题"
    />
  );
};
