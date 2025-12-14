/*
  Warnings:

  - Made the column `email` on table `Parent` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Parent" ALTER COLUMN "email" SET NOT NULL;
