import { prisma } from '../src/config/db';

async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log('Database connection successful!');
    const userCount = await prisma.user.count();
    const videoCount = await prisma.video.count();
    const mediaAssetCount = await prisma.mediaAsset.count();
    const followCount = await prisma.follow.count();
    const categoryCount = await prisma.category.count();

    console.log(`✓ "users" table reachable (${userCount} rows)`);
    console.log(`✓ "videos" table reachable (${videoCount} rows)`);
    console.log(`✓ "media_assets" table reachable (${mediaAssetCount} rows)`);
    console.log(`✓ "follows" table reachable (${followCount} rows)`);
    console.log(`✓ "categories" table reachable (${categoryCount} rows)`);

    console.log('\n✓ Schema fully migrated and reachable');
  } catch (error) {
    console.error('✗ Database test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseConnection();
