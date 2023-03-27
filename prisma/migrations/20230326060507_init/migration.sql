-- CreateTable
CREATE TABLE "task" (
    "id" SERIAL NOT NULL,
    "actor" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "originalname" TEXT NOT NULL,
    "objectname" TEXT,
    "linked_objects" TEXT,
    "bucket" TEXT NOT NULL,
    "parameters" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);
