-- CreateTable
CREATE TABLE "task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "originalname" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "parameters" TEXT,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "s3object" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "task_id" INTEGER NOT NULL,
    "main" BOOLEAN NOT NULL DEFAULT false,
    "objectname" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "size" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "s3object_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
