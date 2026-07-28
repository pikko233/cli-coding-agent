import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_DURATION,
  type ToastOptions,
  type ToastVariant,
} from "./types";
import { useTerminalDimensions } from "@opentui/react";
import { SplitBorder } from "../../components/border";
import { useTheme } from "../theme";

export type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);

  if (!value) {
    throw new Error("useToast方法必须在ToastProvider里使用");
  }

  return value;
}

type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const timeoutHandleRef = useRef<NodeJS.Timeout | null>(null);

  const clearCurrentTimeout = useCallback(() => {
    if (timeoutHandleRef.current) {
      clearTimeout(timeoutHandleRef.current);
      timeoutHandleRef.current = null;
    }
  }, [timeoutHandleRef]);

  const show = useCallback(
    (options: ToastOptions) => {
      const duration = options.duration ?? DEFAULT_DURATION;
      // 清除上一次的通知弹窗
      clearCurrentTimeout();

      // 设置新的通知消息提示
      setCurrentToast({
        ...options,
        variant: options.variant ?? "info",
        duration,
      });

      // 设置定时器
      timeoutHandleRef.current = setTimeout(() => {
        setCurrentToast(null);
      }, duration).unref();
    },
    [clearCurrentTimeout],
  );

  const value: ToastContextValue = {
    show,
  };

  return (
    <ToastContext value={value}>
      {children}
      <Toast currentToast={currentToast} />
    </ToastContext>
  );
}

type ToastProps = {
  currentToast: ToastOptions | null;
};

function Toast({ currentToast }: ToastProps) {
  const { width } = useTerminalDimensions();
  const { colors } = useTheme();

  if (!currentToast) return null;

  const variantColors: Record<ToastVariant, string> = {
    success: colors.success,
    error: colors.error,
    info: colors.info,
  };

  const borderColor = currentToast.variant
    ? variantColors[currentToast.variant]
    : variantColors.info;

  return (
    <box
      position="absolute"
      justifyContent="center"
      alignItems="flex-start"
      top={2}
      right={2}
      paddingX={2}
      paddingY={1}
      width={Math.max(1, Math.min(60, width - 6))}
      backgroundColor={colors.surface}
      borderColor={borderColor}
      border={["left", "right"]}
      customBorderChars={SplitBorder}
      zIndex={200}
    >
      <box flexDirection="column" gap={1} width="100%">
        <text fg="#E1E1E1" wrapMode="word" width="100%">
          {currentToast.message}
        </text>
      </box>
    </box>
  );
}
