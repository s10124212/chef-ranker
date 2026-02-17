-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "imageUrl" TEXT,
    "summary" TEXT,
    "category" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "isTasteRelevant" BOOLEAN NOT NULL DEFAULT false,
    "relevanceCategory" TEXT,
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataExtracted" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_NewsItem" ("id", "title", "url", "source", "imageUrl", "summary", "category", "publishedAt", "isTasteRelevant", "relevanceCategory", "relevanceScore", "fetchedAt", "dataExtracted")
SELECT "id", "title", "url", "source", "imageUrl", "summary", "category", "publishedAt", CASE WHEN "relevanceScore" > 0 THEN 1 ELSE 0 END, NULL, "relevanceScore", "fetchedAt", "dataExtracted" FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";
CREATE UNIQUE INDEX "NewsItem_url_key" ON "NewsItem"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
