"use client";

import { X } from "@phosphor-icons/react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";

export function NoraModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <ModalOverlay isOpen={open} onOpenChange={(o) => !o && onClose()} isDismissable>
      <Modal className="max-w-[460px] bg-white">
        <Dialog aria-label={title}>
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink">{title}</h2>
                {description && <p className="mt-1 text-sm break-words text-ink-2">{description}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-md p-1 text-ink-3 hover:bg-canvas hover:text-ink">
                <X size={18} aria-hidden />
              </button>
            </div>
            {children && <div className="mt-5 flex flex-col gap-4">{children}</div>}
            <div className="mt-6 flex justify-end gap-2">{footer}</div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
