import { Prisma } from '@prisma/client';

/**
 * 削除しようとしたレコードが、他テーブルから参照されていて外部キー制約で
 * 削除できない場合 true を返す。
 *
 * - 通常の外部キー違反 (PostgreSQL 23503) は Prisma が P2003 (Known) として返す。
 * - onDelete: Restrict 指定の違反 (PostgreSQL 23001) は Prisma が分類できず
 *   PrismaClientUnknownRequestError として返すため、メッセージで判定する。
 */
export function isForeignKeyConstraintError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  ) {
    return true;
  }
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /foreign key constraint|violates RESTRICT/i.test(error.message)
  ) {
    return true;
  }
  return false;
}
