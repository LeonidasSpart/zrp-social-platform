-- CreateTable
CREATE TABLE "ConsumedPaymentTransaction" (
    "transactionId" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedPaymentTransaction_pkey" PRIMARY KEY ("transactionId")
);

