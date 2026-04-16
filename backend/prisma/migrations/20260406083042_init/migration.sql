-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'OCR_PROCESSING', 'OCR_DONE', 'CONFIRMED', 'UPLOADING_SHAREPOINT', 'COMPLETED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "icon" TEXT,
    "ocrPromptTemplate" TEXT,
    "workflowPromptTemplate" TEXT,
    "sharepointSiteId" TEXT,
    "sharepointDriveId" TEXT,
    "sharepointFolderPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "contractNumber" TEXT,
    "customerName" TEXT,
    "applicationNumber" TEXT,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "sharepointDestinationPath" TEXT,
    "sharepointItemId" TEXT,
    "sharepointWebUrl" TEXT,
    "ocrRawResponse" JSONB,
    "ocrStructuredResult" JSONB,
    "ocrConfidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_files" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebaseUid_key" ON "users"("firebaseUid");

-- CreateIndex
CREATE INDEX "uploads_tabId_idx" ON "uploads"("tabId");

-- CreateIndex
CREATE INDEX "uploads_userId_idx" ON "uploads"("userId");

-- CreateIndex
CREATE INDEX "uploads_status_idx" ON "uploads"("status");

-- CreateIndex
CREATE INDEX "upload_files_uploadId_idx" ON "upload_files"("uploadId");

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "tabs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
