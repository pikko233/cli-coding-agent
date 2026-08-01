import { Outlet } from "react-router";
import { ThemeProvider } from "../providers/theme";
import { KeyboardLayerProvider } from "../providers/keyboard-layer";
import { DialogProvider } from "../providers/dialog";
import { ToastProvider } from "../providers/toast";
import { ThemedRoot } from "./themed-root";
import { PromptConfigProvider } from "../providers/prompt-config";

export function RootLayout() {
  return (
    <ThemeProvider>
      <KeyboardLayerProvider>
        <ToastProvider>
          <PromptConfigProvider>
            <DialogProvider>
              <ThemedRoot>
                <Outlet />
              </ThemedRoot>
            </DialogProvider>
          </PromptConfigProvider>
        </ToastProvider>
      </KeyboardLayerProvider>
    </ThemeProvider>
  );
}
