"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type ToastKind = "success" | "error";
export interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; message: string; kind: ToastKind; action?: ToastAction }

type Push = (message: string, kind?: ToastKind, action?: ToastAction) => void;
const ToastContext = createContext<Push>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback<Push>((message, kind = "success", action) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, kind, action }]);
    // Leave time to reach an Undo button; errors stay a little longer to be read
    setTimeout(() => dismiss(id), action ? 7000 : kind === "error" ? 6000 : 3000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="toast-stack pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id}
               className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-md border border-stone-200 bg-white py-2.5 pl-3.5 pr-2.5 text-[13px] text-stone-800 shadow-pop animate-pop-in">
            {t.kind === "success"
              ? <CheckCircle2 className="size-4 shrink-0 text-accent-600" />
              : <AlertCircle className="size-4 shrink-0 text-rose-700" />}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button type="button" onClick={() => { dismiss(t.id); t.action?.onClick(); }}
                      className="-my-1 shrink-0 rounded px-2 py-1 text-[13px] font-semibold text-accent-700 hover:bg-accent-50">
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
