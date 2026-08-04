import type { RefObject } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { getFilteredCommands } from "./filter-commands";
import { COMMANDS } from "./commands";
import { useTheme } from "../../providers/theme";

const MAX_VISIBLE_ITEMS = 8;

const COMMAND_COL_WIDTH =
  Math.max(...COMMANDS.map((cmd) => cmd.name.length)) + 4;

type CommandMenuProps = {
  query: string;
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  onSelect: (index: number) => void;
  onExecute: (index: number) => void;
};

export const CommandMenu = ({
  query,
  selectedIndex,
  scrollRef,
  onSelect,
  onExecute,
}: CommandMenuProps) => {
  const { colors } = useTheme();
  const filters = getFilteredCommands(query);
  const visibleHeight = Math.min(filters.length, MAX_VISIBLE_ITEMS);

  if (filters.length === 0) {
    return (
      <box paddingX={1}>
        <text attributes={TextAttributes.DIM}>暂无匹配的命令</text>
      </box>
    );
  }

  return (
    <scrollbox ref={scrollRef} height={visibleHeight}>
      {filters.map((cmd, i) => {
        const isSelected = i === selectedIndex;

        return (
          <box
            key={cmd.value}
            flexDirection="row"
            paddingX={1}
            height={1}
            overflow="hidden"
            backgroundColor={isSelected ? colors.selection : undefined}
            onMouseMove={() => onSelect(i)}
            onMouseDown={() => onExecute(i)}
          >
            {/* 命令名 */}
            <box width={COMMAND_COL_WIDTH} flexShrink={0}>
              <text selectable={false} fg={isSelected ? "black" : "white"}>
                /{cmd.name}
              </text>
            </box>
            {/* 命令描述文本 */}
            <box flexGrow={1} flexShrink={1}>
              <text selectable={false} fg={isSelected ? "black" : "gray"}>
                {cmd.description}
              </text>
            </box>
          </box>
        );
      })}
    </scrollbox>
  );
};
