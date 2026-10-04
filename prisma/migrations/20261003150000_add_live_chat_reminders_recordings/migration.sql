-- AlterTable
ALTER TABLE "LiveAudioParticipant" ADD COLUMN     "isChatMuted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastChatMessageAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LiveAudioRoom" ADD COLUMN     "reactionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slowModeSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LiveVideoParticipant" ADD COLUMN     "isChatMuted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastChatMessageAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LiveVideoRoom" ADD COLUMN     "reactionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slowModeSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "liveChatMessageId" TEXT;

-- CreateTable
CREATE TABLE "LiveChatMessage" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "liveAudioRoomId" TEXT,
    "liveVideoRoomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "LiveChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liveAudioRoomId" TEXT,
    "liveVideoRoomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRecording" (
    "id" TEXT NOT NULL,
    "liveAudioRoomId" TEXT,
    "liveVideoRoomId" TEXT,
    "egressId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EGRESS_STARTING',
    "mediaUrl" TEXT,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LiveRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveChatMessage_liveAudioRoomId_createdAt_idx" ON "LiveChatMessage"("liveAudioRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveChatMessage_liveVideoRoomId_createdAt_idx" ON "LiveChatMessage"("liveVideoRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveChatMessage_authorId_idx" ON "LiveChatMessage"("authorId");

-- CreateIndex
CREATE INDEX "LiveReminder_liveAudioRoomId_idx" ON "LiveReminder"("liveAudioRoomId");

-- CreateIndex
CREATE INDEX "LiveReminder_liveVideoRoomId_idx" ON "LiveReminder"("liveVideoRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveReminder_userId_liveAudioRoomId_key" ON "LiveReminder"("userId", "liveAudioRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveReminder_userId_liveVideoRoomId_key" ON "LiveReminder"("userId", "liveVideoRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRecording_egressId_key" ON "LiveRecording"("egressId");

-- CreateIndex
CREATE INDEX "LiveRecording_liveAudioRoomId_idx" ON "LiveRecording"("liveAudioRoomId");

-- CreateIndex
CREATE INDEX "LiveRecording_liveVideoRoomId_idx" ON "LiveRecording"("liveVideoRoomId");

-- CreateIndex
CREATE INDEX "Report_liveChatMessageId_idx" ON "Report"("liveChatMessageId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_liveChatMessageId_fkey" FOREIGN KEY ("liveChatMessageId") REFERENCES "LiveChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_liveAudioRoomId_fkey" FOREIGN KEY ("liveAudioRoomId") REFERENCES "LiveAudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_liveVideoRoomId_fkey" FOREIGN KEY ("liveVideoRoomId") REFERENCES "LiveVideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReminder" ADD CONSTRAINT "LiveReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReminder" ADD CONSTRAINT "LiveReminder_liveAudioRoomId_fkey" FOREIGN KEY ("liveAudioRoomId") REFERENCES "LiveAudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReminder" ADD CONSTRAINT "LiveReminder_liveVideoRoomId_fkey" FOREIGN KEY ("liveVideoRoomId") REFERENCES "LiveVideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRecording" ADD CONSTRAINT "LiveRecording_liveAudioRoomId_fkey" FOREIGN KEY ("liveAudioRoomId") REFERENCES "LiveAudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRecording" ADD CONSTRAINT "LiveRecording_liveVideoRoomId_fkey" FOREIGN KEY ("liveVideoRoomId") REFERENCES "LiveVideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
