import { format } from "date-fns";
import { DialogSearchList } from "../dialog-search-list";
import type { InferResponseType } from "hono";
import { apiClient } from "../../lib/api-client";
import { useCallback, useEffect, useState } from "react";
import { useDialog } from "../../providers/dialog";
import { useNavigate } from "react-router";
import { useToast } from "../../providers/toast";
import { getErrorMessage } from "../../lib/http-errors";
import { TextAttributes } from "@opentui/core";

type Session = InferResponseType<
  (typeof apiClient.sessions)["$get"],
  200
>[number];

export const SessionsDialogContent = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const { close } = useDialog();
  const navigate = useNavigate();
  const { show } = useToast();

  useEffect(() => {
    let ignore = false;

    const fetchSessions = async () => {
      try {
        const res = await apiClient.sessions.$get();
        if (!res.ok) {
          throw new Error(await getErrorMessage(res));
        }

        const data = await res.json();

        if (!ignore) {
          setSessions(data);
          setLoading(false);
        }
      } catch (error) {
        if (ignore) return;

        show({
          variant: "error",
          message: error instanceof Error ? error.message : "加载会话列表失败",
        });
        close();
      }
    };

    fetchSessions();

    return () => {
      ignore = true;
    };
  }, [close, show]);

  // 选择某一个会话
  const handleSelect = useCallback(
    (session: Session) => {
      close();
      navigate(`/sessions/${session.id}`);
    },
    [close, navigate],
  );

  if (loading) {
    return (
      <box flexDirection="row" justifyContent="center">
        <text attributes={TextAttributes.DIM}>加载会话列表中...</text>
      </box>
    );
  }

  return (
    <DialogSearchList
      items={sessions}
      onSelect={handleSelect}
      filterFn={(s, query) =>
        s.title.toLowerCase().includes(query.toLowerCase())
      }
      renderItem={(session, isSelected) => (
        <>
          <text selectable={false} fg={isSelected ? "black" : "white"}>
            {session.title}
          </text>
          <box flexGrow={1}></box>
          <text
            selectable={false}
            attributes={TextAttributes.DIM}
            fg={isSelected ? "black" : undefined}
          >
            {format(new Date(session.createdAt), "hh:mm a")}
          </text>
        </>
      )}
      getKey={(s) => s.id}
      placeholder="搜索会话标题"
      emptyText="暂无相关会话"
    ></DialogSearchList>
  );
};
