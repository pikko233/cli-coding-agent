import type { ReactNode } from "react";
import { useTheme } from "../providers/theme";

export function ThemedRoot({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <box
      backgroundColor={colors.background}
      width="100%"
      height="100%"
      flexGrow={1}
    >
      {children}
    </box>
  );
}
