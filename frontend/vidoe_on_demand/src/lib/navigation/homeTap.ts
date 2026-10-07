type Listener = () => void;
const listeners = new Set<Listener>();

/** The dock's Home button was tapped. The Home screen listens so it can go back to "All" at the top. */
export const homeTap = {
  emit: () => listeners.forEach((listener) => listener()),
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
