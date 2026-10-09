import type { ComponentProps } from 'react';
import { EmptyHero } from './EmptyHero';

type Props = {
  icon: ComponentProps<typeof EmptyHero>['icon'];
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

/** Same look as EmptyState / EmptyHero, so every empty screen in the app matches. */
export const EmptyNotice = ({ icon, title, message, action }: Props) => (
  <EmptyHero icon={icon} title={title} message={message} action={action} />
);
