/*
  Warnings:

  - A unique constraint covering the columns `[customerCode]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "customerCode" TEXT;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "distributorId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_customerCode_key" ON "Client"("customerCode");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
