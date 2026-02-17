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
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataExtracted" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_NewsItem" ("category", "fetchedAt", "id", "imageUrl", "publishedAt", "source", "summary", "title", "url") SELECT "category", "fetchedAt", "id", "imageUrl", "publishedAt", "source", "summary", "title", "url" FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";
CREATE UNIQUE INDEX "NewsItem_url_key" ON "NewsItem"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
