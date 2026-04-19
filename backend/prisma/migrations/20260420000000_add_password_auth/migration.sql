-- Add passwordHash and make firebaseUid nullable; add unique index on email.

ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;

ALTER TABLE "users" ALTER COLUMN "firebaseUid" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
