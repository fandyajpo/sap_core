-- CreateTable
CREATE TABLE "master_data"."validation_references" (
    "id" UUID NOT NULL,
    "validation_record_id" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "validation_references_validation_record_id_idx" ON "master_data"."validation_references"("validation_record_id");

-- AddForeignKey
ALTER TABLE "master_data"."validation_references" ADD CONSTRAINT "validation_references_validation_record_id_fkey" FOREIGN KEY ("validation_record_id") REFERENCES "core"."validation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
