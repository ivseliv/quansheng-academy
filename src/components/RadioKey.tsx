import { useEffect, useRef, useState, type ReactNode } from "react";

export interface RadioKeyProps {
  id: string;
  label: ReactNode;
  sub?: string;
  className?: string;
  help: string;
  onPress: (long: boolean) => void;
  onHold?: (down: boolean) => void;
  onHelp: (text: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export function RadioKey({
  id,
  label,
  sub,
  className = "",
  help,
  onPress,
  onHold,
  onHelp,
  onStart,
  onEnd,
}: RadioKeyProps) {
  const started = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const repeater = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdCallback = useRef(onHold);
  holdCallback.current = onHold;
  const endCallback = useRef(onEnd);
  endCallback.current = onEnd;
  useEffect(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      if (repeater.current) clearInterval(repeater.current);
      if (started.current !== null) holdCallback.current?.(false);
      started.current = null;
      endCallback.current?.();
      setDown(false);
    };
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
    };
  }, []);
  const [down, setDown] = useState(false);
  const start = () => {
    if (started.current !== null) return;
    onStart?.();
    started.current = performance.now();
    longFired.current = false;
    setDown(true);
    onHold?.(true);
    if (!onHold)
      timer.current = setTimeout(() => {
        longFired.current = true;
        onPress(true);
        if (id === "UP" || id === "DOWN")
          repeater.current = setInterval(() => onPress(false), 140);
      }, 650);
  };
  const end = (cancel = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (repeater.current) clearInterval(repeater.current);
    if (started.current === null) return;
    if (onHold) onHold(false);
    else if (!cancel && !longFired.current) onPress(false);
    started.current = null;
    onEnd?.();
    setDown(false);
  };
  return (
    <button
      type="button"
      className={`radio-key ${className} ${down ? "pressed" : ""}`}
      data-radio-key={id}
      aria-label={
        id === "MENU"
          ? "M — меню"
          : id === "STAR"
            ? "* — сканирование"
            : id === "F"
              ? "F / # — функция и блокировка"
              : id
      }
      title={`${help}\nПравый клик — справка. Долгое нажатие: 0,65 с.`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={() => end()}
      onPointerCancel={() => end(true)}
      onLostPointerCapture={() => end(true)}
      onContextMenu={(e) => {
        e.preventDefault();
        end(true);
        onHelp(help);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!e.repeat) start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          end();
        }
      }}
      onBlur={() => end(true)}
      onClick={(e) => {
        if (e.detail === 0 && started.current === null) onPress(false);
      }}
    >
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}
