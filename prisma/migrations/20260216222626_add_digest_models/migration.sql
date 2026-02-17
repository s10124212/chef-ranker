-- CreateTable
CREATE TABLE "NewsSubscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscribedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" DATETIME,
    "lastDigestSent" DATETIME
);

-- CreateTable
CREATE TABLE "DigestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientCount" INTEGER NOT NULL,
    "storyCount" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "newsItemIds" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DigestSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromEmail" TEXT NOT NULL DEFAULT 'digest@chefranker.com',
    "fromName" TEXT NOT NULL DEFAULT 'Chef Ranker',
    "sendHour" INTEGER NOT NULL DEFAULT 8,
    "sendMinute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York'
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsSubscriber_email_key" ON "NewsSubscriber"("email");
