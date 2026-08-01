import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { DialogSearchList } from "../dialog-search-list";
import type { SupportedChatModelId } from "@cli-coding-agent/shared";
import { usePromptConfig } from "../../providers/prompt-config";

type ModelsDialogContentProps = {
  models: SupportedChatModelId[];
  onSelectModel: (modelId: SupportedChatModelId) => void;
};

export const ModelsDialogContent = ({
  models,
  onSelectModel,
}: ModelsDialogContentProps) => {
  const dialog = useDialog();

  // 回车确认
  const handleSelect = useCallback(
    (model: SupportedChatModelId) => {
      onSelectModel(model);
      dialog.close();
    },
    [onSelectModel, dialog],
  );

  return (
    <DialogSearchList
      items={models}
      onSelect={handleSelect}
      filterFn={(modelId, query) =>
        modelId.toLowerCase().includes(query.toLowerCase())
      }
      renderItem={(modelId, isSelected) => (
        <text selectable={false} fg={isSelected ? "black" : "white"}>
          {modelId}
        </text>
      )}
      getKey={(modelId) => modelId}
      placeholder="搜索模型"
      emptyText="暂无相关模型"
    />
  );
};
