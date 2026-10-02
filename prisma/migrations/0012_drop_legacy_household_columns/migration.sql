-- DropForeignKey
ALTER TABLE "Household" DROP CONSTRAINT "Household_accountContactId_fkey";

-- AlterTable
ALTER TABLE "Household" DROP COLUMN "accountContactId",
DROP COLUMN "headOfHousehold",
DROP COLUMN "passwordHash";

