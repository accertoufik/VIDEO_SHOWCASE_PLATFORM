import { layout } from '@/css';

/** Extra tappable margin so a control smaller than the minimum touch target (44) can still be hit with a thumb. */
export const hitSlopFor = (size: number) => {
  const extra = Math.max(0, Math.ceil((layout.minTouchTarget - size) / 2));
  return { top: extra, bottom: extra, left: extra, right: extra };
};
