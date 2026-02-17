-- CreateTable
CREATE TABLE "ChefContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT NOT NULL,
    "email" TEXT,
    "agentName" TEXT,
    "agentEmail" TEXT,
    "restaurantEmail" TEXT,
    "phone" TEXT,
    "preferredContactMethod" TEXT,
    "linkedinUrl" TEXT,
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChefContact_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT NOT NULL,
    "templateId" TEXT,
    "toEmail" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'drafted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutreachDraft_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SenderSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "title" TEXT,
    "company" TEXT,
    "email" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "ChefContact_chefId_key" ON "ChefContact"("chefId");
