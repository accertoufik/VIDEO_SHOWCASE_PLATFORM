// Imperative toast API: toast.success("Saved"), toast.error("..."). The ToastHost component renders it.
export type ToastTone = 'info' | 'success' | 'error';
export type ToastEvent = {
  message: string;
  tone: ToastTone;
  /** Optional: runs when the toast is tapped (e.g. open the screen it is about). */
  onPress?: () => void;
};

type Listener = (event: ToastEvent) => void;
const listeners = new Set<Listener>();

const show = (
  message: string,
  tone: ToastTone = 'info',
  onPress?: () => void,
) => {
  listeners.forEach((listener) => listener({ message, tone, onPress }));
};

export const toast = {
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  show,
  info: (message: string, onPress?: () => void) => show(message, 'info', onPress),
  success: (message: string, onPress?: () => void) =>
    show(message, 'success', onPress),
  error: (message: string) => show(message, 'error'),
};
