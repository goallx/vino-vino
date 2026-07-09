import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

// A styled, promise-based replacement for window.confirm(). Call the function
// from useConfirm() and await the boolean, exactly like the native dialog.
const ConfirmCtx = createContext<ConfirmFn>(async () => false);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx);
}

interface Pending {
  opts: ConfirmOptions;
  resolve: (result: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  );

  const close = useCallback(
    (result: boolean) => {
      setPending((p) => {
        p?.resolve(result);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!pending) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && (
        <div className="scrim confirm-scrim" role="presentation" onClick={() => close(false)}>
          <div
            className="confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.opts.title ?? pending.opts.message}
            onClick={(e) => e.stopPropagation()}
          >
            {pending.opts.title && <h2 className="confirm__title">{pending.opts.title}</h2>}
            <p className="confirm__msg">{pending.opts.message}</p>
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => close(false)}>
                {pending.opts.cancelLabel ?? 'ביטול'}
              </button>
              <button
                ref={okRef}
                className={`btn ${pending.opts.danger ? 'btn--danger' : 'btn--send'}`}
                onClick={() => close(true)}
              >
                {pending.opts.confirmLabel ?? 'אישור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
