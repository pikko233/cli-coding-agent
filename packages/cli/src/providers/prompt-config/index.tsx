import {
  DEFAULT_CHAT_MODEL_ID,
  Mode,
  type SupportedChatModelId,
  type ModeType,
} from "@cli-coding-agent/shared";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type PromptConfigContextValue = {
  mode: ModeType;
  toggleMode: () => void;
  setMode: (mode: ModeType) => void;
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
  const [mode, setMode] = useState<ModeType>(Mode.BUILD);
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
