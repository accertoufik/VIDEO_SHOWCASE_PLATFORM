import 'dotenv/config';
import { prisma } from '../src/config/db';

/**
 * One-time seed for the categories table. Run with:
 *   bun run src/scripts/seed-categories.ts
 *
 * categoryId is now REQUIRED at upload time, so this needs to run before
 * anyone can upload a video — otherwise the category dropdown/picker on
 * the frontend has nothing to show.
 *
 * Uses upsert on the unique `slug` so re-running this script is always
 * safe — it will never create duplicates.
 */
const CATEGORIES = [
  { name: 'Music', slug: 'music' },
  { name: 'Gaming', slug: 'gaming' },
  { name: 'Education', slug: 'education' },
  { name: 'Comedy', slug: 'comedy' },
  { name: 'Sports', slug: 'sports' },
  { name: 'News & Politics', slug: 'news-politics' },
  { name: 'Technology', slug: 'technology' },
  { name: 'Entertainment', slug: 'entertainment' },
  { name: 'Travel', slug: 'travel' },
  { name: 'Food', slug: 'food' },
  { name: 'Vlogs', slug: 'vlogs' },
  { name: 'Movies & Shows', slug: 'movies-shows' },
];

const seedCategories = async () => {
  try {
    for (const category of CATEGORIES) {
      const result = await prisma.category.upsert({
        where: { slug: category.slug },
        update: { name: category.name },
        create: category,
      });
      console.log(`OK: ${result.name} (${result.id})`);
    }
    console.log(`Seeded ${CATEGORIES.length} categories.`);
  } catch (error) {
    console.error('Failed to seed categories:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

await seedCategories();
