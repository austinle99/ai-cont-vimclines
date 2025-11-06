-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "public"."Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_level_idx" ON "public"."Alert"("level");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "public"."Alert"("createdAt");

-- CreateIndex
CREATE INDEX "Booking_date_idx" ON "public"."Booking"("date");

-- CreateIndex
CREATE INDEX "Booking_emptyLaden_idx" ON "public"."Booking"("emptyLaden");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "public"."Booking"("status");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "public"."Proposal"("status");

-- CreateIndex
CREATE INDEX "Proposal_createdAt_idx" ON "public"."Proposal"("createdAt");
