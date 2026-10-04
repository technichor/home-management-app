-- CreateTable
CREATE TABLE "EmailLogEntry" (
    "id" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLogEntry_createdAt_idx" ON "EmailLogEntry"("createdAt");

