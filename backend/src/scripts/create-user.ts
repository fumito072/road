import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function main() {
  const [email, password, displayNameArg] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npx ts-node src/scripts/create-user.ts <email> <password> [displayName]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const displayName = displayNameArg?.trim() || null;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: { passwordHash, displayName },
      create: { email: normalizedEmail, passwordHash, displayName },
    });

    console.log(`User ready: ${user.email} (id=${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
