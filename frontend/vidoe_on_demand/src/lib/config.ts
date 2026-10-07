//single place that reads public env vars. fails loudly at startup instead of
//producing confusing 'undefined/api/...' errors later on

const requireEnv = (name: string, value: string | undefined) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const API_BASE_URL = requireEnv(
  'EXPO_PUBLIC_API_BASE_URL',
  process.env.EXPO_PUBLIC_API_BASE_URL,
).replace(/\/$/, ''); // remove trailing slash

export const CLERK_PUBLISHABLE_KEY = requireEnv(
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
);