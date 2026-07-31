import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { DEFAULT_CHAT_MODEL_ID } from "@cli-coding-agent/shared";

export const StatusBar = () => {
  const { colors } = useTheme();

  return (
    <box flexDirection="row" gap={1}>
      <text fg={colors.primary}>Build</text>
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
        ›
      </text>
      <text>{DEFAULT_CHAT_MODEL_ID}</text>
    </box>
  );
};
