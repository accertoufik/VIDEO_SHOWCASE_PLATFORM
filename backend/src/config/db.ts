import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { dbEnv } from './env';

const adapter = new PrismaPg({ connectionString: dbEnv.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });


