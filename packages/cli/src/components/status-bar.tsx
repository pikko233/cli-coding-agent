import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { DEFAULT_CHAT_MODEL_ID } from "@cli-coding-agent/shared";
import { usePromptConfig } from "../providers/prompt-config";
import { Mode } from "@cli-coding-agent/database/enums";

export const StatusBar = () => {
  const { colors } = useTheme();
  const { mode, model } = usePromptConfig();

  return (
    <box flexDirection="row" gap={1}>
      <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>
        {mode === Mode.PLAN ? "Plan" : "Build"}
      </text>
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
        ›
      </text>
      <text>{model}</text>
    </box>
  );
};
