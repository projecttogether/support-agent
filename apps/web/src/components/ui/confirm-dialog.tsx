import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";
import { Spinner } from "./spinner";
import { useT } from "@/i18n";
import { common } from "./messages";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Default: "Confirm". */
  confirmLabel?: ReactNode;
  destructive?: boolean;
  /** May return a promise: the dialog shows progress and closes when it resolves (stays open on errors). */
  onConfirm: () => unknown;
  children?: ReactNode;
};

/** Asks before something irreversible. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const tc = useT(common);
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      await props.onConfirm();
      props.onOpenChange(false);
    } catch {
      // The caller reports the error (toast); keep the dialog open to retry.
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={props.open} onOpenChange={(open) => !pending && props.onOpenChange(open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          {props.description ? <AlertDialogDescription>{props.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {props.children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{tc("cancel")}</AlertDialogCancel>
          <Button
            type="button"
            variant={props.destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => void confirm()}
          >
            {pending ? <Spinner /> : null}
            {props.confirmLabel ?? tc("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
