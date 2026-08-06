import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { DialogSearchList } from "../dialog-search-list";
import { Mode, type ModeType } from "@cli-coding-agent/shared";

const AVAILABLE_MODES = [Mode.BUILD, Mode.PLAN];

type AgentsDialogContentProps = {
  currentMode: ModeType;
  onSelectMode: (mode: ModeType) => void;
};

function getModeLabel(mode: ModeType) {
  return mode === Mode.BUILD ? "Build" : "Plan";
}

export const AgentsDialogContent = ({
  currentMode,
  onSelectMode,
}: AgentsDialogContentProps) => {
  const dialog = useDialog();

  // 回车确认
  const handleSelect = useCallback(
    (mode: ModeType) => {
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
