import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { SplitBorder } from "../border";

type Props = {
  message: string;
};

export function UserMessage({ message }: Props) {
  const { colors } = useTheme();

  return (
    <box width="100%" alignItems="center">
      {/* 消息边框 */}
      <box
        border={["left"]}
        borderColor={colors.primary}
        customBorderChars={{
          ...SplitBorder,
        }}
        width="100%"
      >
        {/* 消息内容 */}
        <box
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          width="100%"
          backgroundColor={colors.surface}
        >
          <text attributes={TextAttributes.DIM}>{message}</text>
        </box>
      </box>
    </box>
  );
}
