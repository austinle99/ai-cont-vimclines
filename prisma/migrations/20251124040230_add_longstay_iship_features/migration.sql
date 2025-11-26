-- DropIndex
DROP INDEX "public"."Alert_status_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Booking_destination_size_date_idx";

-- DropIndex
DROP INDEX "public"."Booking_destination_size_idx";

-- DropIndex
DROP INDEX "public"."Inventory_port_type_stock_idx";

-- DropIndex
DROP INDEX "public"."Proposal_status_createdAt_idx";

-- CreateTable
CREATE TABLE "public"."ContainerTracking" (
    "id" TEXT NOT NULL,
    "containerNo" TEXT NOT NULL,
    "containerType" TEXT NOT NULL,
    "emptyLaden" TEXT NOT NULL,
    "currentLocation" TEXT NOT NULL,
    "lastMovementDate" TIMESTAMP(3) NOT NULL,
    "firstSeenDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dwellDays" INTEGER NOT NULL DEFAULT 0,
    "shipmentId" TEXT,
    "billOfLading" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "consignee" TEXT,
    "movementHistory" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LongstayAnalysis" (
    "id" TEXT NOT NULL,
    "containerTrackingId" TEXT NOT NULL,
    "containerNo" TEXT NOT NULL,
    "currentDwellDays" INTEGER NOT NULL,
    "predictedDwellDays" INTEGER,
    "longstayRiskScore" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "historicalPattern" JSONB,
    "seasonalFactors" JSONB,
    "locationFactors" JSONB,
    "demandFactors" JSONB,
    "recommendedAction" TEXT,
    "suggestedDestination" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "potentialSavings" DOUBLE PRECISION,
    "longstayThreshold" INTEGER NOT NULL DEFAULT 14,
    "criticalThreshold" INTEGER NOT NULL DEFAULT 21,
    "analysisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "LongstayAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IShipData" (
    "id" TEXT NOT NULL,
    "containerTrackingId" TEXT,
    "containerNo" TEXT NOT NULL,
    "shipmentNo" TEXT,
    "bookingNo" TEXT,
    "billOfLading" TEXT,
    "containerType" TEXT,
    "emptyLaden" TEXT,
    "depot" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "shipper" TEXT,
    "consignee" TEXT,
    "commodity" TEXT,
    "gateInDate" TIMESTAMP(3),
    "gateOutDate" TIMESTAMP(3),
    "estimatedPickupDate" TIMESTAMP(3),
    "actualPickupDate" TIMESTAMP(3),
    "currentStatus" TEXT,
    "remarks" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "dataHash" TEXT,

    CONSTRAINT "IShipData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LongstayMLData" (
    "id" TEXT NOT NULL,
    "containerNo" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "actualDwellDays" INTEGER NOT NULL,
    "predictedDwellDays" INTEGER,
    "error" DOUBLE PRECISION,
    "containerType" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "seasonMonth" INTEGER NOT NULL,
    "weekOfYear" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',
    "accuracy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LongstayMLData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContainerTracking_containerNo_key" ON "public"."ContainerTracking"("containerNo");

-- CreateIndex
CREATE INDEX "ContainerTracking_containerNo_idx" ON "public"."ContainerTracking"("containerNo");

-- CreateIndex
CREATE INDEX "ContainerTracking_emptyLaden_idx" ON "public"."ContainerTracking"("emptyLaden");

-- CreateIndex
CREATE INDEX "ContainerTracking_currentLocation_idx" ON "public"."ContainerTracking"("currentLocation");

-- CreateIndex
CREATE INDEX "ContainerTracking_status_idx" ON "public"."ContainerTracking"("status");

-- CreateIndex
CREATE INDEX "ContainerTracking_dwellDays_idx" ON "public"."ContainerTracking"("dwellDays");

-- CreateIndex
CREATE INDEX "ContainerTracking_lastMovementDate_idx" ON "public"."ContainerTracking"("lastMovementDate");

-- CreateIndex
CREATE INDEX "LongstayAnalysis_containerNo_idx" ON "public"."LongstayAnalysis"("containerNo");

-- CreateIndex
CREATE INDEX "LongstayAnalysis_longstayRiskScore_idx" ON "public"."LongstayAnalysis"("longstayRiskScore");

-- CreateIndex
CREATE INDEX "LongstayAnalysis_riskLevel_idx" ON "public"."LongstayAnalysis"("riskLevel");

-- CreateIndex
CREATE INDEX "LongstayAnalysis_currentDwellDays_idx" ON "public"."LongstayAnalysis"("currentDwellDays");

-- CreateIndex
CREATE INDEX "LongstayAnalysis_analysisDate_idx" ON "public"."LongstayAnalysis"("analysisDate");

-- CreateIndex
CREATE INDEX "LongstayAnalysis_status_idx" ON "public"."LongstayAnalysis"("status");

-- CreateIndex
CREATE INDEX "IShipData_containerNo_idx" ON "public"."IShipData"("containerNo");

-- CreateIndex
CREATE INDEX "IShipData_scrapedAt_idx" ON "public"."IShipData"("scrapedAt");

-- CreateIndex
CREATE INDEX "IShipData_depot_idx" ON "public"."IShipData"("depot");

-- CreateIndex
CREATE INDEX "IShipData_currentStatus_idx" ON "public"."IShipData"("currentStatus");

-- CreateIndex
CREATE INDEX "IShipData_dataHash_idx" ON "public"."IShipData"("dataHash");

-- CreateIndex
CREATE INDEX "LongstayMLData_containerNo_idx" ON "public"."LongstayMLData"("containerNo");

-- CreateIndex
CREATE INDEX "LongstayMLData_location_idx" ON "public"."LongstayMLData"("location");

-- CreateIndex
CREATE INDEX "LongstayMLData_createdAt_idx" ON "public"."LongstayMLData"("createdAt");

-- CreateIndex
CREATE INDEX "LongstayMLData_modelVersion_idx" ON "public"."LongstayMLData"("modelVersion");

-- AddForeignKey
ALTER TABLE "public"."LongstayAnalysis" ADD CONSTRAINT "LongstayAnalysis_containerTrackingId_fkey" FOREIGN KEY ("containerTrackingId") REFERENCES "public"."ContainerTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IShipData" ADD CONSTRAINT "IShipData_containerTrackingId_fkey" FOREIGN KEY ("containerTrackingId") REFERENCES "public"."ContainerTracking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
