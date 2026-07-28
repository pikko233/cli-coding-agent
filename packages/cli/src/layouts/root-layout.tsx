import { Outlet } from "react-router";
import { ThemeProvider } from "../providers/theme";
import { KeyboardLayerProvider } from "../providers/keyboard-layer";
import { DialogProvider } from "../providers/dialog";
import { ToastProvider } from "../providers/toast";
import { ThemedRoot } from "./themed-root";

export function RootLayout() {
  return (
    <ThemeProvider>
      <KeyboardLayerProvider>
        <DialogProvider>
          <ToastProvider>
            <ThemedRoot>
              <Outlet />
            </ThemedRoot>
          </ToastProvider>
        </DialogProvider>
      </KeyboardLayerProvider>
    </ThemeProvider>
  );
}
