import { useEffect, useRef } from "react";

/*
 * Keyboard/focus contract for ZRP's hand-rolled modals.
 *
 * Most modals in src/components are a plain fixed overlay with a panel
 * inside: pointer users can close them with the X button, but a
 * keyboard or screen-reader user had no Escape, focus stayed on the
 * (now covered) trigger behind the overlay, and on close focus fell
 * back to <body>. This hook gives every such dialog the same minimal
 * behaviour without restructuring it:
 *
 *  - Escape closes the dialog (unless `canClose` is false, e.g. while a
 *    submit is in flight). Only the top-most open dialog reacts, so an
 *    Escape inside a nested ConfirmModal doesn't also close its parent.
 *  - On open, focus moves into the panel (unless something inside it
 *    already took focus, e.g. an autoFocus field).
 *  - On close, focus returns to whatever element opened the dialog.
 *
 * Attach the returned ref to the panel element and give that element
 * role="dialog" aria-modal="true" and tabIndex={-1}.
 */
const openStack: symbol[] = [];

export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  canClose: boolean = true
) {
  const panelRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  onCloseRef.current = onClose;
  canCloseRef.current = canClose;

  useEffect(() => {
    if (!open) return;

    const token = Symbol("dialog");
    openStack.push(token);

    const previouslyFocused =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openStack[openStack.length - 1] !== token) return;
      if (!canCloseRef.current) return;
      event.stopPropagation();
      onCloseRef.current();
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openStack.indexOf(token);
      if (index !== -1) openStack.splice(index, 1);
      if (
        previouslyFocused &&
        previouslyFocused !== document.body &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return panelRef;
}
