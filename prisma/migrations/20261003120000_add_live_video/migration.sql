-- CreateTable
CREATE TABLE "LiveVideoRoom" (
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
    "peakParticipantCount" INTEGER NOT NULL DEFAULT 0,
    "peakViewerCount" INTEGER NOT NULL DEFAULT 0,
    "totalUniqueParticipants" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LiveVideoRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveVideoParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LiveAudioParticipantRole" NOT NULL DEFAULT 'LISTENER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "isCameraOff" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "LiveVideoParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveVideoSpeakerRequest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LiveAudioSpeakerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "LiveVideoSpeakerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveVideoModerationAction" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" "LiveAudioModerationActionType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveVideoModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveVideoRoom_visibility_status_idx" ON "LiveVideoRoom"("visibility", "status");

-- CreateIndex
CREATE INDEX "LiveVideoRoom_status_idx" ON "LiveVideoRoom"("status");

-- CreateIndex
CREATE INDEX "LiveVideoRoom_communityId_idx" ON "LiveVideoRoom"("communityId");

-- CreateIndex
CREATE INDEX "LiveVideoRoom_hostId_idx" ON "LiveVideoRoom"("hostId");

-- CreateIndex
CREATE INDEX "LiveVideoParticipant_roomId_role_idx" ON "LiveVideoParticipant"("roomId", "role");

-- CreateIndex
CREATE INDEX "LiveVideoParticipant_userId_idx" ON "LiveVideoParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveVideoParticipant_roomId_userId_key" ON "LiveVideoParticipant"("roomId", "userId");

-- CreateIndex
CREATE INDEX "LiveVideoSpeakerRequest_roomId_status_idx" ON "LiveVideoSpeakerRequest"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LiveVideoSpeakerRequest_roomId_userId_key" ON "LiveVideoSpeakerRequest"("roomId", "userId");

-- CreateIndex
CREATE INDEX "LiveVideoModerationAction_roomId_idx" ON "LiveVideoModerationAction"("roomId");

-- CreateIndex
CREATE INDEX "LiveVideoModerationAction_targetUserId_idx" ON "LiveVideoModerationAction"("targetUserId");

-- AddForeignKey
ALTER TABLE "LiveVideoRoom" ADD CONSTRAINT "LiveVideoRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoRoom" ADD CONSTRAINT "LiveVideoRoom_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoParticipant" ADD CONSTRAINT "LiveVideoParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveVideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoParticipant" ADD CONSTRAINT "LiveVideoParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoParticipant" ADD CONSTRAINT "LiveVideoParticipant_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoSpeakerRequest" ADD CONSTRAINT "LiveVideoSpeakerRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveVideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoSpeakerRequest" ADD CONSTRAINT "LiveVideoSpeakerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoSpeakerRequest" ADD CONSTRAINT "LiveVideoSpeakerRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoModerationAction" ADD CONSTRAINT "LiveVideoModerationAction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveVideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoModerationAction" ADD CONSTRAINT "LiveVideoModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveVideoModerationAction" ADD CONSTRAINT "LiveVideoModerationAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
