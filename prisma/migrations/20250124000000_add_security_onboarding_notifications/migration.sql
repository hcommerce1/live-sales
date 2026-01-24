-- Migration: Add Security, Onboarding, and Notification features
-- New: NotificationSettings, UserOnboarding, TwoFactorBackupCode
-- Modified: User (2FA fields), CompanySecret (name, isDefault), Export (secretId)

-- =====================================================
-- Add 2FA fields to users
-- =====================================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- Add name and isDefault to company_secrets
-- =====================================================
ALTER TABLE "company_secrets" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Domyślny token';
ALTER TABLE "company_secrets" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Drop old unique constraint and create new one (companyId, secretType, name)
-- Note: The old constraint was (companyId, secretType)
DROP INDEX IF EXISTS "company_secrets_companyId_secretType_key";
CREATE UNIQUE INDEX IF NOT EXISTS "company_secrets_companyId_secretType_name_key" ON "company_secrets"("companyId", "secretType", "name");

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS "company_secrets_companyId_secretType_idx" ON "company_secrets"("companyId", "secretType");

-- =====================================================
-- Add secretId to exports (for token selection)
-- =====================================================
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "secretId" TEXT;

-- Add foreign key constraint
ALTER TABLE "exports"
  ADD CONSTRAINT IF NOT EXISTS "exports_secretId_fkey"
  FOREIGN KEY ("secretId")
  REFERENCES "company_secrets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "exports_secretId_idx" ON "exports"("secretId");

-- =====================================================
-- CreateTable: notification_settings
-- =====================================================
CREATE TABLE IF NOT EXISTS "notification_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "errorEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyOnExportError" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnPaymentIssue" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: notification_settings
CREATE UNIQUE INDEX IF NOT EXISTS "notification_settings_companyId_key" ON "notification_settings"("companyId");

-- AddForeignKey
ALTER TABLE "notification_settings"
  ADD CONSTRAINT IF NOT EXISTS "notification_settings_companyId_fkey"
  FOREIGN KEY ("companyId")
  REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================
-- CreateTable: user_onboarding
-- =====================================================
CREATE TABLE IF NOT EXISTS "user_onboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenConfigured" BOOLEAN NOT NULL DEFAULT false,
    "firstExportCreated" BOOLEAN NOT NULL DEFAULT false,
    "sheetsConnected" BOOLEAN NOT NULL DEFAULT false,
    "firstExportRun" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: user_onboarding
CREATE UNIQUE INDEX IF NOT EXISTS "user_onboarding_userId_key" ON "user_onboarding"("userId");

-- AddForeignKey
ALTER TABLE "user_onboarding"
  ADD CONSTRAINT IF NOT EXISTS "user_onboarding_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================
-- CreateTable: two_factor_backup_codes
-- =====================================================
CREATE TABLE IF NOT EXISTS "two_factor_backup_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: two_factor_backup_codes
CREATE INDEX IF NOT EXISTS "two_factor_backup_codes_userId_idx" ON "two_factor_backup_codes"("userId");
CREATE INDEX IF NOT EXISTS "two_factor_backup_codes_userId_usedAt_idx" ON "two_factor_backup_codes"("userId", "usedAt");

-- AddForeignKey
ALTER TABLE "two_factor_backup_codes"
  ADD CONSTRAINT IF NOT EXISTS "two_factor_backup_codes_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================
-- Set existing tokens as default (one per company+provider)
-- =====================================================
UPDATE "company_secrets" cs
SET "isDefault" = true
WHERE cs.id IN (
  SELECT DISTINCT ON ("companyId", "secretType") id
  FROM "company_secrets"
  ORDER BY "companyId", "secretType", "createdAt" ASC
);
