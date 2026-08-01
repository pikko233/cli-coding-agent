import "opentui-spinner/react";
import { useTheme } from "../providers/theme";
import { Mode } from "@cli-coding-agent/database/enums";
import { usePromptConfig } from "../providers/prompt-config";

export function Spinner() {
  const { colors } = useTheme();
  const { mode } = usePromptConfig();
  const activeColor = mode === Mode.BUILD ? colors.primary : colors.planMode;

  return <spinner name="aesthetic" color={activeColor} />;
}
