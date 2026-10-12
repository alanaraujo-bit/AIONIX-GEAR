-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'SALES', 'INVENTORY');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('CPU', 'GPU', 'MOTHERBOARD', 'RAM', 'STORAGE', 'PSU', 'CASE', 'COOLER', 'MONITOR', 'PERIPHERAL', 'NETWORK', 'NOTEBOOK', 'PC', 'CONSOLE', 'CONSUMABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('ROOM', 'SHELF', 'DRAWER', 'BOX', 'STORAGE', 'WAREHOUSE', 'EXTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('UNIT', 'LOT');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'INSPECTION', 'DEFECTIVE', 'IN_BUILD', 'IN_NEGOTIATION', 'CONSIGNED_OUT', 'INSTALLED', 'SOLD', 'DELIVERED', 'RETURNED', 'EXCHANGED', 'DISASSEMBLED', 'DISPOSED', 'VOID');

-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('OWNED', 'CONSIGNED_IN', 'CLIENT', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS');

-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('KNOWN', 'ESTIMATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('PURCHASE', 'TRADE', 'TRADE_IN', 'BUILD', 'DISASSEMBLY', 'MIGRATION', 'IMPORT', 'CONSIGNMENT', 'CLIENT', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeOrgId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Belem',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "plan" TEXT NOT NULL DEFAULT 'founder',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "onboardedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("orgId","key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("orgId","key")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" "LocationKind" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "name" TEXT NOT NULL,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "tracking" "TrackingMode" NOT NULL DEFAULT 'UNIT',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "serial" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "ownership" "Ownership" NOT NULL DEFAULT 'OWNED',
    "ownerContactId" TEXT,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "defects" TEXT,
    "completeness" JSONB NOT NULL DEFAULT '{}',
    "accessories" TEXT,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "tracking" "TrackingMode" NOT NULL DEFAULT 'UNIT',
    "qtyInitial" INTEGER NOT NULL DEFAULT 1,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 1,
    "qtyReserved" INTEGER NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER,
    "costStatus" "CostStatus" NOT NULL DEFAULT 'KNOWN',
    "expectedPriceCents" INTEGER,
    "minPriceCents" INTEGER,
    "estimatedValueCents" INTEGER,
    "estimatedValueNote" TEXT,
    "estimatedValueAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "warrantyNotes" TEXT,
    "locationId" TEXT,
    "acquisitionType" "AcquisitionType" NOT NULL DEFAULT 'PURCHASE',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourcePurchaseLineId" TEXT,
    "sourceTradeId" TEXT,
    "sourceSaleId" TEXT,
    "sourceBuildId" TEXT,
    "sourceDisassemblyId" TEXT,
    "importBatchId" TEXT,
    "parentItemId" TEXT,
    "holdType" TEXT,
    "holdId" TEXT,
    "holdUntil" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fromStatus" "ItemStatus",
    "toStatus" "ItemStatus",
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "qtyDelta" INTEGER,
    "refType" TEXT,
    "refId" TEXT,
    "reason" TEXT,
    "userId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PHOTO',
    "storage" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentData" (
    "attachmentId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "AttachmentData_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT,
    "scannedCode" TEXT,
    "expectedLocationId" TEXT,
    "foundLocationId" TEXT,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "countedQty" INTEGER,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "resolutionNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "rowCount" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "document" TEXT,
    "city" TEXT,
    "state" TEXT,
    "instagram" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "extrasCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "tracking" "TrackingMode" NOT NULL DEFAULT 'UNIT',
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "locationId" TEXT,
    "serials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expectedPriceCents" INTEGER,
    "notes" TEXT,
    "allocatedCents" INTEGER,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "PurchaseExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUOTE',
    "channel" TEXT,
    "quoteValidUntil" TIMESTAMP(3),
    "reserveItems" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "shippingChargedCents" INTEGER NOT NULL DEFAULT 0,
    "shippingCostCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "tradeInCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "warrantyDays" INTEGER,
    "notes" TEXT,
    "afterSalesNotes" TEXT,
    "shareToken" TEXT,
    "opportunityId" TEXT,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "costCents" INTEGER,
    "costStatus" "CostStatus",
    "returnedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturn" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "refundCents" INTEGER NOT NULL,
    "itemStatus" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashInCents" INTEGER NOT NULL DEFAULT 0,
    "cashOutCents" INTEGER NOT NULL DEFAULT 0,
    "feesCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "valuation" JSONB,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOutLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "agreedValueCents" INTEGER NOT NULL,
    "estimatedValueCents" INTEGER,
    "costCents" INTEGER,
    "costStatus" "CostStatus",

    CONSTRAINT "TradeOutLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeInLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "conditionReport" TEXT,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "agreedValueCents" INTEGER NOT NULL,
    "estimatedValueCents" INTEGER,
    "expectedPriceCents" INTEGER,
    "locationId" TEXT,
    "allocatedCostCents" INTEGER,
    "createdItemId" TEXT,

    CONSTRAINT "TradeInLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeRevision" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SALE',
    "contactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "ownLaborCents" INTEGER NOT NULL DEFAULT 0,
    "targetPriceCents" INTEGER,
    "warrantyDays" INTEGER,
    "description" TEXT,
    "testNotes" TEXT,
    "benchmarks" TEXT,
    "notes" TEXT,
    "resultItemId" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildPart" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "role" TEXT,
    "costCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "removedReason" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "BuildPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildExpense" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "accountId" TEXT,
    "transactionId" TEXT,
    "titleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disassembly" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "sourceCostCents" INTEGER,
    "writeOffCents" INTEGER NOT NULL DEFAULT 0,
    "allocation" JSONB NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Disassembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SELL',
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "valueCents" INTEGER,
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "notes" TEXT,
    "lostReason" TEXT,
    "linkType" TEXT,
    "linkId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BANK',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "systemKey" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "contactId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "settledCents" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "installmentNo" INTEGER,
    "installmentCount" INTEGER,
    "method" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "categoryId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "transactionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "method" TEXT,
    "categoryId" TEXT,
    "contactId" TEXT,
    "description" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "reversalOfId" TEXT,
    "transferGroupId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "itemId" TEXT,
    "saleId" TEXT,
    "tradeId" TEXT,
    "buildId" TEXT,
    "contactId" TEXT,
    "categoryId" TEXT,
    "costStatus" "CostStatus",
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupToken_tokenHash_key" ON "SetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_orgId_idx" ON "Invitation"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_entityType_entityId_idx" ON "AuditLog"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SavedView_orgId_module_idx" ON "SavedView"("orgId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "Category_orgId_name_key" ON "Category"("orgId", "name");

-- CreateIndex
CREATE INDEX "Location_orgId_idx" ON "Location"("orgId");

-- CreateIndex
CREATE INDEX "Product_orgId_name_idx" ON "Product"("orgId", "name");

-- CreateIndex
CREATE INDEX "Item_orgId_status_idx" ON "Item"("orgId", "status");

-- CreateIndex
CREATE INDEX "Item_orgId_serial_idx" ON "Item"("orgId", "serial");

-- CreateIndex
CREATE INDEX "Item_orgId_productId_idx" ON "Item"("orgId", "productId");

-- CreateIndex
CREATE INDEX "Item_orgId_locationId_idx" ON "Item"("orgId", "locationId");

-- CreateIndex
CREATE INDEX "Item_parentItemId_idx" ON "Item"("parentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_orgId_code_key" ON "Item"("orgId", "code");

-- CreateIndex
CREATE INDEX "ItemEvent_orgId_itemId_createdAt_idx" ON "ItemEvent"("orgId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemEvent_orgId_refType_refId_idx" ON "ItemEvent"("orgId", "refType", "refId");

-- CreateIndex
CREATE INDEX "CostEntry_orgId_itemId_idx" ON "CostEntry"("orgId", "itemId");

-- CreateIndex
CREATE INDEX "Attachment_orgId_entityType_entityId_idx" ON "Attachment"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Note_orgId_entityType_entityId_idx" ON "Note"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_orgId_code_key" ON "StockCount"("orgId", "code");

-- CreateIndex
CREATE INDEX "StockCountLine_orgId_countId_idx" ON "StockCountLine"("orgId", "countId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_itemId_key" ON "StockCountLine"("countId", "itemId");

-- CreateIndex
CREATE INDEX "Contact_orgId_name_idx" ON "Contact"("orgId", "name");

-- CreateIndex
CREATE INDEX "Purchase_orgId_date_idx" ON "Purchase"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_orgId_code_key" ON "Purchase"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_shareToken_key" ON "Sale"("shareToken");

-- CreateIndex
CREATE INDEX "Sale_orgId_status_date_idx" ON "Sale"("orgId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_orgId_code_key" ON "Sale"("orgId", "code");

-- CreateIndex
CREATE INDEX "SaleLine_orgId_itemId_idx" ON "SaleLine"("orgId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_orgId_code_key" ON "Trade"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Build_orgId_code_key" ON "Build"("orgId", "code");

-- CreateIndex
CREATE INDEX "BuildPart_orgId_itemId_idx" ON "BuildPart"("orgId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Disassembly_orgId_code_key" ON "Disassembly"("orgId", "code");

-- CreateIndex
CREATE INDEX "Opportunity_orgId_stage_idx" ON "Opportunity"("orgId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyAccount_orgId_name_key" ON "MoneyAccount"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_orgId_name_key" ON "FinanceCategory"("orgId", "name");

-- CreateIndex
CREATE INDEX "Title_orgId_direction_status_dueDate_idx" ON "Title"("orgId", "direction", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Title_orgId_sourceType_sourceId_idx" ON "Title"("orgId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reversalOfId_key" ON "Settlement"("reversalOfId");

-- CreateIndex
CREATE INDEX "Settlement_orgId_titleId_idx" ON "Settlement"("orgId", "titleId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransaction_reversalOfId_key" ON "MoneyTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "MoneyTransaction_orgId_date_idx" ON "MoneyTransaction"("orgId", "date");

-- CreateIndex
CREATE INDEX "MoneyTransaction_orgId_accountId_idx" ON "MoneyTransaction"("orgId", "accountId");

-- CreateIndex
CREATE INDEX "MoneyTransaction_orgId_refType_refId_idx" ON "MoneyTransaction"("orgId", "refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultEntry_reversalOfId_key" ON "ResultEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "ResultEntry_orgId_date_idx" ON "ResultEntry"("orgId", "date");

-- CreateIndex
CREATE INDEX "ResultEntry_orgId_kind_date_idx" ON "ResultEntry"("orgId", "kind", "date");

-- CreateIndex
CREATE INDEX "ResultEntry_orgId_itemId_idx" ON "ResultEntry"("orgId", "itemId");

-- CreateIndex
CREATE INDEX "ResultEntry_orgId_saleId_idx" ON "ResultEntry"("orgId", "saleId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupToken" ADD CONSTRAINT "SetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerContactId_fkey" FOREIGN KEY ("ownerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemEvent" ADD CONSTRAINT "ItemEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentData" ADD CONSTRAINT "AttachmentData_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseExtra" ADD CONSTRAINT "PurchaseExtra_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOutLine" ADD CONSTRAINT "TradeOutLine_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeInLine" ADD CONSTRAINT "TradeInLine_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeRevision" ADD CONSTRAINT "TradeRevision_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildPart" ADD CONSTRAINT "BuildPart_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildExpense" ADD CONSTRAINT "BuildExpense_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "MoneyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Integridade de negócio garantida pelo banco ─────────────
-- Estoque nunca negativo e reserva nunca maior que o saldo físico.
ALTER TABLE "Item" ADD CONSTRAINT "item_qty_nonneg" CHECK ("qtyOnHand" >= 0 AND "qtyReserved" >= 0 AND "qtyReserved" <= "qtyOnHand");
-- Unidade rastreada individualmente tem sempre quantidade 0 ou 1.
ALTER TABLE "Item" ADD CONSTRAINT "item_unit_qty" CHECK ("tracking" <> 'UNIT' OR ("qtyInitial" = 1 AND "qtyOnHand" <= 1));
-- Custo desconhecido nunca vira zero silenciosamente.
ALTER TABLE "Item" ADD CONSTRAINT "item_cost_status" CHECK (("costStatus" = 'UNKNOWN') = ("unitCostCents" IS NULL) OR ("costStatus" = 'UNKNOWN' AND "unitCostCents" IS NOT NULL));
ALTER TABLE "Item" ADD CONSTRAINT "item_cost_nonneg" CHECK ("unitCostCents" IS NULL OR "unitCostCents" >= 0);
-- Movimentos de dinheiro são sempre positivos; a direção diz se entrou ou saiu.
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "tx_amount_pos" CHECK ("amountCents" > 0);
ALTER TABLE "MoneyTransaction" ADD CONSTRAINT "tx_direction" CHECK ("direction" IN ('IN','OUT'));
ALTER TABLE "Title" ADD CONSTRAINT "title_amounts" CHECK ("amountCents" > 0 AND "settledCents" >= 0 AND "settledCents" <= "amountCents");
ALTER TABLE "SaleLine" ADD CONSTRAINT "saleline_qty" CHECK ("quantity" > 0 AND "returnedQty" >= 0 AND "returnedQty" <= "quantity" AND "unitPriceCents" >= 0);
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "purchaseline_qty" CHECK ("quantity" > 0 AND "unitPriceCents" >= 0);
-- Uma unidade só pode estar ativa em uma montagem por vez.
CREATE UNIQUE INDEX "buildpart_active_unit" ON "BuildPart" ("itemId") WHERE "status" = 'ACTIVE' AND "quantity" = 1 AND "removedAt" IS NULL;
-- Busca textual rápida
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "item_search_trgm" ON "Item" USING gin ((lower("title" || ' ' || coalesce("serial",'') || ' ' || "code")) gin_trgm_ops);
CREATE INDEX "contact_search_trgm" ON "Contact" USING gin ((lower("name" || ' ' || coalesce("phone",'') || ' ' || coalesce("whatsapp",'') || ' ' || coalesce("email",''))) gin_trgm_ops);
