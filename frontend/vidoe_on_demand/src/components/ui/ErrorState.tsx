import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { describeError, type ErrorKind } from '@/lib/errors/describeError';
import { EmptyState } from './EmptyState';

type IconName = ComponentProps<typeof Ionicons>['name'];

const presentation: Record<ErrorKind, { icon: IconName; title: string }> = {
  network: { icon: 'cloud-offline-outline', title: "You're offline" },
  auth: { icon: 'lock-closed-outline', title: 'Sign in required' },
  forbidden: { icon: 'hand-left-outline', title: 'Not allowed' },
  notFound: { icon: 'film-outline', title: 'Not available' },
  conflict: { icon: 'sync-outline', title: 'Out of date' },
  invalid: { icon: 'alert-circle-outline', title: "Something's off" },
  rateLimited: { icon: 'time-outline', title: 'Slow down a moment' },
  server: { icon: 'alert-circle-outline', title: 'Something went wrong' },
  unknown: { icon: 'alert-circle-outline', title: 'Something went wrong' },
};

type Props = { error: unknown; onRetry?: () => void };

// Retry is offered for failures that can plausibly succeed later; not for 404/403 where retrying is pointless.
export const ErrorState = ({ error, onRetry }: Props) => {
  const { kind, message } = describeError(error);
  const { icon, title } = presentation[kind];
  const retryable =
    kind === 'network' ||
    kind === 'server' ||
    kind === 'rateLimited' ||
    kind === 'unknown';

  return (
    <EmptyState
      icon={icon}
      title={title}
      message={message}
      actionLabel={retryable && onRetry ? 'Try again' : undefined}
      onAction={retryable ? onRetry : undefined}
    />
  );
};
