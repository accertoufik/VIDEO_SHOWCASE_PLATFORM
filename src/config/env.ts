import { z } from 'zod';

const dbEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

const appEnvSchema = dbEnvSchema.extend({
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
  CLERK_WEBHOOK_SECRET: z.string().min(1, 'CLERK_WEBHOOK_SECRET is required'),
  AZURE_STORAGE_CONNECTION_STRING: z
    .string()
    .min(1, 'AZURE_STORAGE_CONNECTION_STRING is required'),
  AZURE_STORAGE_CONTAINER_ORIGINALS: z.string().default('originals'),
  AZURE_STORAGE_CONTAINER_PROCESSED: z.string().default('processed'),
  AZURE_STORAGE_CONTAINER_THUMBNAILS: z.string().default('thumbnails'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

const parse = <T extends z.ZodTypeAny>(schema: T): z.infer<T> => {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(z.treeifyError(result.error));
    throw new Error('Invalid environment variables — see above.');
  }
  return result.data;
};

export const dbEnv = parse(dbEnvSchema);
export const env = parse(appEnvSchema);
