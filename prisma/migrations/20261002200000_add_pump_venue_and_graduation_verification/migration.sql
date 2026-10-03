-- CreateEnum
CREATE TYPE "TokenVenue" AS ENUM ('DIRECT_MINT', 'PUMP_CURVE');

-- AlterTable
ALTER TABLE "GraduationEvent" ADD COLUMN     "migrationVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mintAmountRaw" DECIMAL(38,0),
ADD COLUMN     "poolMigrationFeeLamports" DECIMAL(38,0),
ADD COLUMN     "solAmountLamports" DECIMAL(38,0);

-- AlterTable
ALTER TABLE "LaunchedToken" ADD COLUMN     "venue" "TokenVenue" NOT NULL DEFAULT 'DIRECT_MINT',
ALTER COLUMN "feeAmount" DROP NOT NULL,
ALTER COLUMN "feeTransactionId" DROP NOT NULL;
