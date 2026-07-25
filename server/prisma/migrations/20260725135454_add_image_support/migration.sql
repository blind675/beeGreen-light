-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "acceptImage" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Image_projectId_createdAt_idx" ON "Image"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
