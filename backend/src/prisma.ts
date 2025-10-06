import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Database initialization and verification
export const initDatabase = async () => {
  try {
    // Test connection
    await prisma.$connect();
    console.log('✓ Database connected successfully');

    // Verify tables exist
    const userCount = await prisma.user.count();
    console.log(`✓ Database tables accessible (${userCount} users)`);
  } catch (error) {
    console.error('❌ Database connection error:', error);
    console.log('\nPlease ensure:');
    console.log('1. You have run the database setup SQL in Supabase');
    console.log('2. DATABASE_URL in .env is correct');
    console.log('3. Your Supabase database is accessible\n');
  }
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
