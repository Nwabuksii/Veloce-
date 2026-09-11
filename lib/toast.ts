export type ToastType = "success" | "error" | "info";

export interface ToastPayload {
  message: string;
  type?: ToastType;
  duration?: number;
}

export const TOAST_EVENT = "veloce:toast";

/**
 * Fire-and-forget toast. Dispatches a CustomEvent picked up by
 * <ToastViewport /> (mounted once in app/layout.tsx), so this can be
 * called from any client component without a provider/context.
 *
 * This replaces window.alert() across the app.
 */
export function showToast(message: string, type: ToastType = "info", duration = 4000) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, type, duration } })
  );
}

export const toast = {
  success: (message: string, duration?: number) => showToast(message, "success", duration),
  error: (message: string, duration?: number) => showToast(message, "error", duration),
  info: (message: string, duration?: number) => showToast(message, "info", duration),
};
