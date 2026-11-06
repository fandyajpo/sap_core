-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateTable
CREATE TABLE "core"."validation_records" (
    "id" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_records_pkey" PRIMARY KEY ("id")
);
