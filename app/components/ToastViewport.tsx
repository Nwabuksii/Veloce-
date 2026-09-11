"use client";

import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT, ToastPayload, ToastType } from "@/lib/toast";

interface ToastItem extends Required<Omit<ToastPayload, "type">> {
  id: number;
  type: ToastType;
  leaving?: boolean;
}

const ICONS: Record<ToastType, string> = {
  success: "fa-circle-check",
  error: "fa-circle-exclamation",
  info: "fa-circle-info",
};

let nextId = 1;

export default function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>[]>>({});

  useEffect(() => {
    function handle(e: Event) {
      const { message, type = "info", duration = 4000 } = (e as CustomEvent<ToastPayload>).detail;
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type, duration }]);

      const dismissTimer = setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        const removeTimer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
          delete timers.current[id];
        }, 180);
        timers.current[id] = [dismissTimer, removeTimer];
      }, duration);
      timers.current[id] = [dismissTimer];
    }

    window.addEventListener(TOAST_EVENT, handle);
    return () => {
      window.removeEventListener(TOAST_EVENT, handle);
      Object.values(timers.current).flat().forEach(clearTimeout);
    };
  }, []);

  function dismiss(id: number) {
    (timers.current[id] || []).forEach(clearTimeout);
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 180);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}${t.leaving ? " toast-leaving" : ""}`}>
          <i className={`fas ${ICONS[t.type]} toast-icon`}></i>
          <span>{t.message}</span>
          <button className="toast-dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <i className="fas fa-xmark"></i>
          </button>
        </div>
      ))}
    </div>
  );
}
