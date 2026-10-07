// Tiny pub/sub so the query layer can raise user-facing errors before the Toast
// component exists (Phase 2 subscribes to this).
export type AppErrorEvent = { message: string;  status?: number; details?: unknown };
type AppErrorListener = (event: AppErrorEvent) => void;

const listeners = new Set<AppErrorListener>();

export const errorBus = {
  follow: (listener: AppErrorListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  publish: (event: AppErrorEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  },
};