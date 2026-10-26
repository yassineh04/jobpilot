"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/format";
import { Button, IconButton } from "./Button";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export function Modal({ title, description, onClose, children, footer, size = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Parents pass inline callbacks; keep the latest one without re-running the mount effect
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Focus the first field (or the panel) for keyboard users
    const first = panelRef.current?.querySelector<HTMLElement>("input, textarea, select, [data-autofocus]");
    (first ?? panelRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-[8vh] animate-fade-in"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}
           className={cn("flex max-h-[84dvh] w-full flex-col rounded-lg border border-stone-200 bg-white shadow-pop outline-none animate-pop-in",
                         SIZES[size])}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-100 px-5 py-3.5">
          <div>
            <h2 id="modal-title" className="text-[15px] font-semibold text-stone-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-stone-500">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5"><X className="size-4" /></IconButton>
        </div>
        {/* Only the content scrolls: the title and the actions stay in view */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 rounded-b-lg border-t border-stone-100 bg-stone-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onCancel, loading }: {
  title: string; message: React.ReactNode; confirmLabel?: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <Modal title={title} onClose={onCancel} size="sm"
           footer={<>
             <Button onClick={onCancel}>Cancel</Button>
             <Button variant="danger" onClick={onConfirm} loading={loading} data-autofocus>{confirmLabel}</Button>
           </>}>
      <div className="text-sm text-stone-600">{message}</div>
    </Modal>
  );
}
