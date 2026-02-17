-- CreateTable
CREATE TABLE "Chef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "currentRestaurant" TEXT,
    "cuisineSpecialties" TEXT,
    "yearsExperience" INTEGER,
    "photoUrl" TEXT,
    "bio" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "totalScore" REAL NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Accolade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "year" INTEGER,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Accolade_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CareerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "restaurant" TEXT NOT NULL,
    "city" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareerEntry_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndustryRecognition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "year" INTEGER,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndustryRecognition_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublicSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "metric" TEXT,
    "value" REAL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicSignal_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PeerStanding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "relatedChef" TEXT,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PeerStanding_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoringWeight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MonthlySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SnapshotEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "chefId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalScore" REAL NOT NULL,
    "breakdown" TEXT,
    "delta" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SnapshotEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MonthlySnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SnapshotEntry_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chefId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "fetchedAt" DATETIME,
    "status" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataSource_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Chef_slug_key" ON "Chef"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringWeight_category_key" ON "ScoringWeight"("category");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySnapshot_month_key" ON "MonthlySnapshot"("month");

-- CreateIndex
CREATE UNIQUE INDEX "SnapshotEntry_snapshotId_chefId_key" ON "SnapshotEntry"("snapshotId", "chefId");
