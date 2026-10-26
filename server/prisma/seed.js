import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required.')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, max: 10 }),
})

try {
  await prisma.numberSlot.createMany({
    data: Array.from({ length: 100 }, (_, index) => ({ number: index + 1 })),
    skipDuplicates: true,
  })
} finally {
  await prisma.$disconnect()
}
