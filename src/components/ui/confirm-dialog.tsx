"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
}

/**
 * Reusable confirmation modal replacing native window.confirm() dialogs.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  variant = "destructive",
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = React.useState(false);
  const isBusy = loading || internalLoading;

  const handleConfirm = async () => {
    try {
      const result = onConfirm();
      if (result && typeof (result as Promise<void>).then === "function") {
        setInternalLoading(true);
        await result;
      }
      onOpenChange(false);
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
      <DialogContent showCloseButton={false} className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant}
            size="sm"
            onClick={handleConfirm}
            disabled={isBusy}
          >
            {isBusy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook returning an imperative confirm() trigger and the corresponding ConfirmDialog node.
 */
export function useConfirmDialog() {
  const [state, setState] = React.useState<ConfirmOptions & { open: boolean }>({
    open: false,
    title: "",
    onConfirm: () => {},
  });

  const confirm = React.useCallback((options: ConfirmOptions) => {
    setState({
      open: true,
      ...options,
    });
  }, []);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => setState((prev) => ({ ...prev, open }))}
      title={state.title}
      description={state.description}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      variant={state.variant}
      onConfirm={state.onConfirm}
    />
  );

  return { confirm, dialog };
}
