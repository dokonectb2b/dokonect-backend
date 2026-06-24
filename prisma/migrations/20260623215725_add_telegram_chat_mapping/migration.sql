/*
  Warnings:

  - You are about to drop the column `telegramChatId` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "telegramChatId";

-- CreateTable
CREATE TABLE "TelegramChatMapping" (
    "phone" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChatMapping_pkey" PRIMARY KEY ("phone")
);
