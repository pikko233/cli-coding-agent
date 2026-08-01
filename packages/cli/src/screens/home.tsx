import { useCallback } from "react";
import { useNavigate } from "react-router";
import { Header } from "../components/header";
import { InputBar } from "../components/input-bar";
import { usePromptConfig } from "../providers/prompt-config";
import { TextAttributes } from "@opentui/core";

export function Home() {
  const navigate = useNavigate();
  const { mode, model } = usePromptConfig();
  const handleSubmit = useCallback(
    (text: string) => {
      navigate("/sessions/new", { state: { message: text, mode, model } });
    },
    [navigate, mode, model],
  );

  return (
    <box
      position="relative"
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
      flexGrow={1}
      width="100%"
      height="100%"
      gap={2}
    >
      <Header />
      <box
        width="100%"
        maxWidth={78}
        paddingX={2}
        flexDirection="column"
        gap={1}
      >
        <InputBar onSubmit={handleSubmit} disabled={false} />
        <box flexDirection="row" gap={1} flexShrink={0} marginLeft="auto">
          <text>tab</text>
          <text attributes={TextAttributes.DIM}>切换智能体模式</text>
        </box>
      </box>
    </box>
  );
}
