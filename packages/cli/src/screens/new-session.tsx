import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTheme } from "../providers/theme";
import {
  BotMessage,
  ErrorMessage,
  UserMessage,
} from "../components/messages/index";
import { SessionShell } from "../components/session-shell";

export function NewSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors } = useTheme();

  const state = location.state as { message: string } | null;

  useEffect(() => {
    if (!state?.message) {
      navigate("/", { replace: true });
    }
  }, [state, navigate]);

  if (!state) return null;

  return (
    <SessionShell onSubmit={() => {}} inputDisabled loading>
      <UserMessage message={state.message} />
      <BotMessage
        content="This is a simple bot response to demostrate the message layout."
        model="opus-4.6"
      />
      <ErrorMessage message="This is a simple error message" />
    </SessionShell>
  );
}
