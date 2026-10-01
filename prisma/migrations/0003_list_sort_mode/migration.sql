-- CreateEnum
CREATE TYPE "ListSortMode" AS ENUM ('MANUAL', 'PAIRWISE');

-- AlterTable
ALTER TABLE "List" ADD COLUMN "sortMode" "ListSortMode" NOT NULL DEFAULT 'MANUAL';
