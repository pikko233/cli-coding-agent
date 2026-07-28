import { useCallback } from "react";
import { useNavigate } from "react-router";
import { Header } from "../components/header";
import { InputBar } from "../components/input-bar";

export function Home() {
  const navigate = useNavigate();
  const handleSubmit = useCallback(
    (text: string) => {
      navigate("/sessions/new", { state: { message: text } });
    },
    [navigate],
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
      <box width="90%">
        <InputBar onSubmit={handleSubmit} disabled={false} />
      </box>
    </box>
  );
}
