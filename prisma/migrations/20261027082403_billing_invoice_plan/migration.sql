-- AlterTable
ALTER TABLE "BillingInvoice" ADD COLUMN     "interval" "BillingInterval",
ADD COLUMN     "plan" "Plan",
ADD COLUMN     "providerPaymentId" TEXT,
ADD COLUMN     "seats" INTEGER;
