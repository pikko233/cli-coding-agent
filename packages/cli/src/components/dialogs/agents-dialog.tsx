import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { DialogSearchList } from "../dialog-search-list";
import { Mode } from "@cli-coding-agent/database/enums";

const AVAILABLE_MODES = [Mode.BUILD, Mode.PLAN];

type AgentsDialogContentProps = {
  currentMode: Mode;
  onSelectMode: (mode: Mode) => void;
};

function getModeLabel(mode: Mode) {
  return mode === Mode.BUILD ? "Build" : "Plan";
}

export const AgentsDialogContent = ({
  currentMode,
  onSelectMode,
}: AgentsDialogContentProps) => {
  const dialog = useDialog();

  // 回车确认
  const handleSelect = useCallback(
    (mode: Mode) => {
      onSelectMode(mode);
      dialog.close();
    },
    [onSelectMode, dialog],
  );

  return (
    <DialogSearchList
      items={AVAILABLE_MODES}
      onSelect={handleSelect}
      filterFn={(mode, query) =>
        getModeLabel(mode).toLowerCase().includes(query.toLowerCase())
      }
      renderItem={(mode, isSelected) => (
        <text selectable={false} fg={isSelected ? "black" : "white"}>
          {mode === currentMode ? " • " : "   "}
          {getModeLabel(mode)}
        </text>
      )}
      getKey={(mode) => getModeLabel(mode)}
      placeholder="搜索智能体模式"
      emptyText="暂无相关模式"
    />
  );
};
