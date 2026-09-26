-- CreateEnum
CREATE TYPE "LiveAudioRoomStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LiveAudioVisibility" AS ENUM ('PUBLIC', 'COMMUNITY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "LiveAudioParticipantRole" AS ENUM ('LISTENER', 'SPEAKER', 'MODERATOR', 'HOST');

-- CreateEnum
CREATE TYPE "LiveAudioSpeakerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LiveAudioModerationActionType" AS ENUM ('MUTE', 'UNMUTE', 'REMOVE', 'PROMOTE_SPEAKER', 'DEMOTE_SPEAKER');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "liveAudioRoomId" TEXT;

-- CreateTable
CREATE TABLE "LiveAudioRoom" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "communityId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "LiveAudioRoomStatus" NOT NULL DEFAULT 'SCHEDULED',
    "visibility" "LiveAudioVisibility" NOT NULL DEFAULT 'PUBLIC',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "peakListenerCount" INTEGER NOT NULL DEFAULT 0,
    "peakSpeakerCount" INTEGER NOT NULL DEFAULT 0,
    "totalUniqueParticipants" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LiveAudioRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveAudioParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LiveAudioParticipantRole" NOT NULL DEFAULT 'LISTENER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "LiveAudioParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveAudioSpeakerRequest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LiveAudioSpeakerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "LiveAudioSpeakerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveAudioModerationAction" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" "LiveAudioModerationActionType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveAudioModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveAudioRoom_visibility_status_idx" ON "LiveAudioRoom"("visibility", "status");

-- CreateIndex
CREATE INDEX "LiveAudioRoom_status_idx" ON "LiveAudioRoom"("status");

-- CreateIndex
CREATE INDEX "LiveAudioRoom_communityId_idx" ON "LiveAudioRoom"("communityId");

-- CreateIndex
CREATE INDEX "LiveAudioRoom_hostId_idx" ON "LiveAudioRoom"("hostId");

-- CreateIndex
CREATE INDEX "LiveAudioParticipant_roomId_role_idx" ON "LiveAudioParticipant"("roomId", "role");

-- CreateIndex
CREATE INDEX "LiveAudioParticipant_userId_idx" ON "LiveAudioParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveAudioParticipant_roomId_userId_key" ON "LiveAudioParticipant"("roomId", "userId");

-- CreateIndex
CREATE INDEX "LiveAudioSpeakerRequest_roomId_status_idx" ON "LiveAudioSpeakerRequest"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LiveAudioSpeakerRequest_roomId_userId_key" ON "LiveAudioSpeakerRequest"("roomId", "userId");

-- CreateIndex
CREATE INDEX "LiveAudioModerationAction_roomId_idx" ON "LiveAudioModerationAction"("roomId");

-- CreateIndex
CREATE INDEX "LiveAudioModerationAction_targetUserId_idx" ON "LiveAudioModerationAction"("targetUserId");

-- CreateIndex
CREATE INDEX "Report_liveAudioRoomId_idx" ON "Report"("liveAudioRoomId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_liveAudioRoomId_fkey" FOREIGN KEY ("liveAudioRoomId") REFERENCES "LiveAudioRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioRoom" ADD CONSTRAINT "LiveAudioRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioRoom" ADD CONSTRAINT "LiveAudioRoom_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioParticipant" ADD CONSTRAINT "LiveAudioParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveAudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioParticipant" ADD CONSTRAINT "LiveAudioParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioParticipant" ADD CONSTRAINT "LiveAudioParticipant_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioSpeakerRequest" ADD CONSTRAINT "LiveAudioSpeakerRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveAudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioSpeakerRequest" ADD CONSTRAINT "LiveAudioSpeakerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioSpeakerRequest" ADD CONSTRAINT "LiveAudioSpeakerRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioModerationAction" ADD CONSTRAINT "LiveAudioModerationAction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveAudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioModerationAction" ADD CONSTRAINT "LiveAudioModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAudioModerationAction" ADD CONSTRAINT "LiveAudioModerationAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

