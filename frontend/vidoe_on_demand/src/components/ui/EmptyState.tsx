import type { ComponentProps } from 'react';
import { EmptyHero } from './EmptyHero';

type Props = {
  icon?: ComponentProps<typeof EmptyHero>['icon'];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Empty screen. One look for the whole app (see EmptyHero): a plain icon, a title, a short message, an optional action. */
export const EmptyState = ({ icon = 'film-outline', title, message, actionLabel, onAction }: Props) => (
  <EmptyHero
    icon={icon}
    title={title}
    message={message}
    action={actionLabel && onAction ? { label: actionLabel, onPress: onAction } : undefined}
  />
);
