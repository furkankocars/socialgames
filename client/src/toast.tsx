import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { Ack } from "../../shared/protocol";

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div className="toast" role="alert" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Runs a server request and shows its error, if any. */
export function useAct() {
  const toast = useToast();
  return useCallback(
    async <T extends Ack<object>>(promise: Promise<T>): Promise<T> => {
      const res = await promise;
      if (!res.ok) toast(res.error);
      return res;
    },
    [toast],
  );
}
