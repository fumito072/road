-- Remove legacy Firebase auth column. Authentication is now email/password + JWT,
-- so firebaseUid is no longer read or written by the application.
DROP INDEX IF EXISTS "users_firebaseUid_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "firebaseUid";
