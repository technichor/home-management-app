-- Additive: the Google Calendar integration (members' connections with encrypted tokens, shared calendars, the household calendar and time zone, and per-event Google fields).
-- AlterTable
ALTER TABLE "CalendarItem" ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "googleSyncError" TEXT,
ADD COLUMN     "toGoogle" BOOLEAN NOT NULL DEFAULT true;
-- AlterTable
ALTER TABLE "CalendarSettings" ADD COLUMN     "googleCalendarId" TEXT,
ADD COLUMN     "googleCalendarName" TEXT,
ADD COLUMN     "googleCalendarUserId" TEXT,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago';
-- CreateTable
CREATE TABLE "GoogleConnection" (
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "needsReconnect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("userId")
);
-- CreateTable
CREATE TABLE "GoogleSharedCalendar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    CONSTRAINT "GoogleSharedCalendar_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "GoogleSharedCalendar_userId_calendarId_key" ON "GoogleSharedCalendar"("userId", "calendarId");
-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "GoogleSharedCalendar" ADD CONSTRAINT "GoogleSharedCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "GoogleConnection"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
