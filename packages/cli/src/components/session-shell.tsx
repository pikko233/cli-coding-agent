import type { ReactNode } from "react";
import { InputBar } from "./input-bar";
import { TextAttributes } from "@opentui/core";
import { Spinner } from "./spinner";

type Props = {
  children?: ReactNode;
  onSubmit: (text: string) => void;
  inputDisabled?: boolean;
  loading?: boolean;
  interruptible?: boolean;
};

export function SessionShell({
  children,
  onSubmit,
  inputDisabled = false,
  loading = false,
  interruptible = false,
}: Props) {
  return (
    // 会话聊天框外壳
    <box
      flexDirection="column"
      flexGrow={1}
      paddingY={1}
      paddingX={2}
      gap={1}
      width="100%"
      height="100%"
    >
      {/* 对话滚动区域 */}
      <scrollbox flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box gap={1}>{children}</box>
      </scrollbox>

      {/* 输入框 */}
      <box flexShrink={0}>
        <InputBar
          onSubmit={onSubmit}
          disabled={inputDisabled}
          placeholder="请输入你的问题"
        />
      </box>

      {/* 底部 */}
      <box
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
        width="100%"
        height={1}
        gap={2}
        paddingLeft={1}
      >
        <box flexDirection="row" alignItems="center" gap={2}>
          {loading ? (
            <>
              <Spinner />
              {interruptible && <text>按esc键中断</text>}
            </>
          ) : null}
        </box>

        <box flexDirection="row" flexShrink={0} gap={1} marginLeft="auto">
          <text>tab</text>
          <text attributes={TextAttributes.DIM}>agents</text>
        </box>
      </box>
    </box>
  );
}
