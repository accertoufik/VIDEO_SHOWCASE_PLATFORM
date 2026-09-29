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
  { name: 'Nature', slug: 'nature' },
  { name: 'News & Politics', slug: 'news-politics' },
  { name: 'Technology', slug: 'technology' },
  { name: 'Entertainment', slug: 'entertainment' },
  { name: 'Travel', slug: 'travel' },
  { name: 'Food', slug: 'food' },
  { name: 'Vlogs', slug: 'vlogs' },
  { name: 'Movies & Shows', slug: 'movies-shows' },
  { name: 'Health & Fitness', slug: 'health-fitness' },
  { name: 'Beauty & Fashion', slug: 'beauty-fashion' },
  { name: 'Science & Nature', slug: 'science-nature' },
  { name: 'Art & Design', slug: 'art-design' },
  { name: 'Automotive', slug: 'automotive' },
  { name: 'Pets & Animals', slug: 'pets-animals' },
  { name: 'Lifestyle', slug: 'lifestyle' },
  { name: 'DIY & Crafts', slug: 'diy-crafts' },
  { name: 'Business & Finance', slug: 'business-finance' },
  { name: 'History', slug: 'history' },
  { name: 'Spirituality & Religion', slug: 'spirituality-religion' },
  { name: 'Parenting', slug: 'parenting' },
  { name: 'Photography', slug: 'photography' },
  { name: 'Racing', slug: 'racing' },
  { name: 'Animation', slug: 'animation' },
  { name: 'Short Films', slug: 'short-films' },
  { name: 'Documentaries', slug: 'documentaries' },
  { name: 'Podcasts', slug: 'podcasts' },
  { name: 'ASMR', slug: 'asmr' },

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
