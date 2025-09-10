-- CreateTable
CREATE TABLE "public"."KPI" (
    "id" SERIAL NOT NULL,
    "utilization" TEXT NOT NULL,
    "storageCost" TEXT NOT NULL,
    "dwellTime" TEXT NOT NULL,
    "approvalRate" TEXT NOT NULL,

    CONSTRAINT "KPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Inventory" (
    "id" SERIAL NOT NULL,
    "port" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "customer" TEXT,
    "status" TEXT,
    "containerNo" TEXT,
    "emptyLaden" TEXT,
    "depot" TEXT,
    "optimizationSuggestion" TEXT,
    "optimizationScore" INTEGER,
    "optimizationType" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Proposal" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "estCost" DOUBLE PRECISION,
    "benefit" DOUBLE PRECISION,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Alert" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "location" TEXT,
    "severity" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Comment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MLTrainingData" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "features" JSONB NOT NULL,
    "suggestion" JSONB NOT NULL,
    "outcome" DOUBLE PRECISION,
    "context" JSONB NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MLTrainingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SuggestionFeedback" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB,
    "notes" TEXT,

    CONSTRAINT "SuggestionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inventory_port_type_idx" ON "public"."Inventory"("port", "type");

-- CreateIndex
CREATE INDEX "Booking_origin_destination_size_idx" ON "public"."Booking"("origin", "destination", "size");

-- CreateIndex
CREATE INDEX "Booking_optimizationScore_idx" ON "public"."Booking"("optimizationScore");

-- CreateIndex
CREATE INDEX "Booking_optimizationType_idx" ON "public"."Booking"("optimizationType");

-- CreateIndex
CREATE INDEX "MLTrainingData_timestamp_idx" ON "public"."MLTrainingData"("timestamp");

-- CreateIndex
CREATE INDEX "MLTrainingData_sessionId_idx" ON "public"."MLTrainingData"("sessionId");

-- CreateIndex
CREATE INDEX "SuggestionFeedback_suggestionId_idx" ON "public"."SuggestionFeedback"("suggestionId");

-- CreateIndex
CREATE INDEX "SuggestionFeedback_action_idx" ON "public"."SuggestionFeedback"("action");

-- AddForeignKey
ALTER TABLE "public"."SuggestionFeedback" ADD CONSTRAINT "SuggestionFeedback_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "public"."MLTrainingData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
