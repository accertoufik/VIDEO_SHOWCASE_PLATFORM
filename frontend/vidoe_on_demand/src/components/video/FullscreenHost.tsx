import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/css';

type Api = { show: (node: ReactNode) => void; hide: () => void };
const Ctx = createContext<Api | null>(null);

/**
 * Where the full-screen player is drawn. It is a plain View covering the whole app, NOT a Modal: a Modal is a separate
 * Android window, and hiding the system navigation bar only affects the app's own window, so inside a Modal the
 * back/home buttons stayed on screen. Drawn here, the immersive mode really removes them.
 * Rendered once by the root layout, above everything else (dock included).
 */
export const FullscreenProvider = ({ children }: { children: ReactNode }) => {
  const [node, setNode] = useState<ReactNode>(null);
  const api = useMemo<Api>(() => ({ show: setNode, hide: () => setNode(null) }), []);
  return (
    <Ctx.Provider value={api}>
      {children}
      {node ? <View style={styles.layer}>{node}</View> : null}
    </Ctx.Provider>
  );
};

/** Draws `content` full screen while `active`; removes it when not. */
export const useFullscreenLayer = (active: boolean, content: ReactNode) => {
  const api = useContext(Ctx);
  useEffect(() => {
    if (!api) return;
    if (active) api.show(content);
    else api.hide();
  });
  useEffect(() => () => api?.hide(), [api]);
};

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000, backgroundColor: colors.player.stage },
});
