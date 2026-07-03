-- AlterTable: Distributor uchun haydovchi komissiyasi (%)
ALTER TABLE "Distributor" ADD COLUMN "driverCommission" DOUBLE PRECISION NOT NULL DEFAULT 10;
