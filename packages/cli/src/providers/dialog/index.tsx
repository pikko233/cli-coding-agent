import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { DialogConfig } from "./types";
import { useKeyboardLayer } from "../keyboard-layer";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { RGBA, TextAttributes } from "@opentui/core";
import { useTheme } from "../theme";

export type DialogContextValue = {
  open: (config: DialogConfig) => void;
  close: () => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error("useDialog必须要在DialogProvider里才能使用");
  }

  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [currentDialog, setCurrentDialog] = useState<DialogConfig | null>(null);
  const { push, pop } = useKeyboardLayer();

  const close = useCallback(() => {
    setCurrentDialog(null);
    pop("dialog");
  }, [pop]);

  const open = useCallback(
    (config: DialogConfig) => {
      setCurrentDialog(config);
      push("dialog", () => {
        close();
        return true;
      });
    },
    [push, close],
  );

  return (
    <DialogContext value={{ open, close }}>
      {children}
      <Dialog currentDialog={currentDialog} close={close} />
    </DialogContext>
  );
}

type DialogProps = {
  currentDialog: DialogConfig | null;
  close: () => void;
};

function Dialog({ currentDialog, close }: DialogProps) {
  const { isTopLayer } = useKeyboardLayer();
  const dimensions = useTerminalDimensions();
  const { colors } = useTheme();

  useKeyboard((key) => {
    if (!currentDialog || !isTopLayer("dialog")) return;

    if (key.name === "escape") {
      key.preventDefault();
      close();
    }
  });

  if (!currentDialog) return null;

  const { title, children } = currentDialog;

  return (
    // 遮罩层背景
    <box
      position="absolute"
      left={0}
      top={0}
      width={dimensions.width}
      height={dimensions.height}
      justifyContent="center"
      alignItems="center"
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      zIndex={100}
      onMouseDown={() => close()}
    >
      {/* 对话框 */}
      <box
        width={Math.min(60, dimensions.width - 6)}
        height="auto"
        backgroundColor={colors.dialogSurface}
        paddingY={1}
        paddingX={4}
        flexDirection="column"
        gap={1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <box
          paddingBottom={1}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          {/* 标题 */}
          <text attributes={TextAttributes.BOLD}>{title}</text>
          {/* 退出按钮 */}
          <text attributes={TextAttributes.DIM} onMouseDown={() => close()}>
            按esc退出
          </text>
        </box>
        <box flexGrow={1}>{children}</box>
      </box>
    </box>
  );
}
