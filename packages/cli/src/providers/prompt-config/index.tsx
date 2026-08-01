import { Mode } from "@cli-coding-agent/database/enums";
import {
  DEFAULT_CHAT_MODEL_ID,
  type SupportedChatModelId,
} from "@cli-coding-agent/shared";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type PromptConfigContextValue = {
  mode: Mode;
  toggleMode: () => void;
  setMode: (mode: Mode) => void;
  model: SupportedChatModelId;
  setModel: (model: SupportedChatModelId) => void;
};

const PromptConfigContext = createContext<PromptConfigContextValue | null>(
  null,
);

export const usePromptConfig = (): PromptConfigContextValue => {
  const value = useContext(PromptConfigContext);

  if (!value) {
    throw new Error("usePromptConfig必须在PromptConfigProvider里才能使用");
  }

  return value;
};

export function PromptConfigProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(Mode.BUILD);
  const [model, setModel] = useState<SupportedChatModelId>(
    DEFAULT_CHAT_MODEL_ID,
  );

  const toggleMode = useCallback(() => {
    setMode((m) => (m === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
  }, []);

  return (
    <PromptConfigContext
      value={{
        mode,
        setMode,
        toggleMode,
        model,
        setModel,
      }}
    >
      {children}
    </PromptConfigContext>
  );
}
