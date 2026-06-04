import { PrismaClient } from '@prisma/client';

// 指定したメールアドレスのユーザーと、そのユーザーに紐づく処理記録（uploads /
// upload_files）を削除する運用スクリプト。
// ※ SharePoint 上の実ファイルには触れない（DB の記録のみ削除）。
//
// Usage:
//   DATABASE_URL='<本番の公開接続URL>' \
//     npx ts-node src/scripts/delete-user.ts <email>
async function main() {
  const [email] = process.argv.slice(2);

  if (!email) {
    console.error('Usage: npx ts-node src/scripts/delete-user.ts <email>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.error(`User not found: ${normalizedEmail}`);
      process.exit(1);
    }

    // 安全装置: 管理者が0人にならないようにする
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        console.error(
          'Refusing to delete the last remaining ADMIN. Create another admin first.',
        );
        process.exit(1);
      }
    }

    // 書類記録を先に削除（upload_files は Cascade で自動削除）→ ユーザー削除
    const deletedUploads = await prisma.$transaction(async (tx) => {
      const uploads = await tx.upload.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
      return uploads.count;
    });

    console.log(
      `Deleted user ${normalizedEmail} (role=${user.role}) and ${deletedUploads} upload record(s). SharePoint files were not touched.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
