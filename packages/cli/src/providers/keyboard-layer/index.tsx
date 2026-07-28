import { useKeyboard, useRenderer } from "@opentui/react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// 键盘事件处理函数，返回是否已处理该事件
type Responder = () => boolean;

type KeyboardLayerContextValue = {
  push: (id: string, responder?: Responder) => void;
  pop: (id: string) => void;
  isTopLayer: (id: string) => boolean;
  setResponder: (id: string, responder: Responder | null) => void;
};

const KeyboardLayerContext = createContext<KeyboardLayerContextValue | null>(
  null,
);

export function KeyboardLayerProvider({ children }: { children: ReactNode }) {
  // 键盘层级栈，越靠后的元素优先级越高
  const [stack, setStack] = useState<string[]>(["base"]);

  // 保存最新的层级栈，供不触发重新渲染的回调读取
  const stackRef = useRef(stack);
  stackRef.current = stack;

  // 保存每个键盘层对应的事件处理函数
  const responders = useRef<Map<string, Responder>>(new Map());
  const renderer = useRenderer();

  // 注册新的键盘层，并将其放到栈顶
  const push = useCallback((id: string, responder?: Responder) => {
    if (responder) {
      responders.current.set(id, responder);
    }

    setStack((prev) => {
      if (prev.includes(id)) {
        return prev;
      }

      return [...prev, id];
    });
  }, []);

  // 移除指定键盘层及其事件处理函数
  const pop = useCallback((id: string) => {
    responders.current.delete(id);
    setStack((prev) => prev.filter((layer) => layer !== id));
  }, []);

  // 判断指定键盘层当前是否拥有最高优先级
  const isTopLayer = useCallback(
    (id: string) => {
      return stack.length === 0 || stack[stack.length - 1] === id;
    },
    [stack],
  );

  // 更新指定键盘层的处理函数，传入 null 时取消注册
  const setResponder = useCallback(
    (id: string, responder: Responder | null) => {
      if (responder) {
        responders.current.set(id, responder);
      } else {
        responders.current.delete(id);
      }
    },
    [],
  );

  // 监听 Ctrl+C，并优先交给当前最上层的组件处理
  useKeyboard((key) => {
    if (!key.ctrl || key.name !== "c") return;

    const currentStack = stackRef.current;

    // 从栈顶向下查找，直到某一层确认已经处理该事件
    for (let i = currentStack.length - 1; i >= 0; i--) {
      const layerId = currentStack[i]!;
      const responder = responders.current.get(layerId);
      if (responder && responder()) {
        return;
      }
    }

    // 没有任何键盘层处理 Ctrl+C 时，退出应用
    renderer.destroy();
  });

  return (
    <KeyboardLayerContext
      value={{
        push,
        pop,
        isTopLayer,
        setResponder,
      }}
    >
      {children}
    </KeyboardLayerContext>
  );
}

export function useKeyboardLayer() {
  const context = useContext(KeyboardLayerContext);

  if (!context) {
    throw new Error("useKeyboardLayer必须在KeyboardLayerProvider里使用");
  }

  return context;
}
