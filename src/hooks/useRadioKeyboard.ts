import { useEffect, useRef } from "react";
import type { RadioAction, RadioKey } from "../model/radio";
const mapping: Record<string, RadioKey> = {
  KeyM: "MENU",
  Enter: "MENU",
  Escape: "EXIT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  KeyF: "F",
  KeyQ: "SK1",
  KeyE: "SK2",
  NumpadMultiply: "STAR",
};
export function useRadioKeyboard(
  send: (a: RadioAction) => void,
  togglePower: () => void,
) {
  const callback = useRef({ send, togglePower });
  callback.current = { send, togglePower };
  useEffect(() => {
    const held = new Map<
      string,
      {
        key: RadioKey;
        timer: ReturnType<typeof setTimeout>;
        repeat?: ReturnType<typeof setInterval>;
        fired: boolean;
      }
    >();
    let ptt = false;
    const releaseAll = () => {
      for (const h of held.values()) {
        clearTimeout(h.timer);
        if (h.repeat) clearInterval(h.repeat);
      }
      held.clear();
      if (ptt) {
        callback.current.send({ type: "PTT", down: false });
        ptt = false;
      }
    };
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement &&
      (e.target.matches("input,textarea,select,[contenteditable=true]") ||
        ((e.key === "Enter" || e.key === " ") &&
          !!e.target.closest("button,a")));
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "KeyP") {
        e.preventDefault();
        if (!e.repeat) callback.current.togglePower();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!ptt) {
          ptt = true;
          callback.current.send({ type: "PTT", down: true });
        }
        return;
      }
      const key =
        e.key === "*"
          ? "STAR"
          : e.key === "#"
            ? "F"
            : /^\d$/.test(e.key)
              ? (e.key as RadioKey)
              : mapping[e.code];
      if (!key) return;
      e.preventDefault();
      if (e.repeat || held.has(e.code)) return;
      if (key !== "F") {
        for (const h of held.values())
          if (h.key === "F" && !h.fired) {
            clearTimeout(h.timer);
            h.fired = true;
            callback.current.send({ type: "KEY", key: "F" });
          }
      }
      const h = {
        key,
        timer: 0 as unknown as ReturnType<typeof setTimeout>,
        fired: false,
        repeat: undefined as ReturnType<typeof setInterval> | undefined,
      };
      h.timer = setTimeout(() => {
        h.fired = true;
        callback.current.send({ type: "KEY", key, long: true });
        if (key === "UP" || key === "DOWN")
          h.repeat = setInterval(
            () => callback.current.send({ type: "KEY", key }),
            140,
          );
      }, 650);
      held.set(e.code, h);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && ptt) {
        e.preventDefault();
        ptt = false;
        callback.current.send({ type: "PTT", down: false });
      }
      const h = held.get(e.code);
      if (!h) return;
      e.preventDefault();
      clearTimeout(h.timer);
      if (h.repeat) clearInterval(h.repeat);
      if (!h.fired) callback.current.send({ type: "KEY", key: h.key });
      held.delete(e.code);
    };
    const visibility = () => {
      if (document.hidden) releaseAll();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      releaseAll();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
}
