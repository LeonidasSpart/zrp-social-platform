import { prisma } from "@/lib/db";
import { getLiveKitConfig } from "@/lib/live-audio/livekit";
import { emitToLiveAudioRoom, emitToLiveVideoRoom } from "@/lib/socket-emit";
import { LiveReplayErrors } from "./errors";

export type LiveRoomType = "AUDIO" | "VIDEO";

/*
 * ============================================================
 * ZRP Live Replay - LiveKit Egress integration
 * ============================================================
 *
 * This is the real, complete Egress code path - not a mock. What it
 * genuinely cannot do in THIS environment is finish a recording,
 * because LiveKit's RoomCompositeEgress has no "just host the file for
 * me" option: EncodedFileOutput always uploads to a cloud object store
 * the caller configures (S3Upload, GCPUpload, or AzureBlobUpload - see
 * @livekit/protocol's EncodedFileOutput). None of those three exist as
 * configured infrastructure anywhere in this codebase (confirmed: no
 * S3/GCS/Azure credentials in README's "Configuration" section, and no
 * existing bucket client beyond UploadThing, which Egress cannot target
 * as an output).
 *
 * getEgressS3Config() below is the single fail-closed gate, same
 * pattern as getLiveKitConfig(): missing env vars -> null -> every
 * caller throws LiveReplayErrors.notConfigured() (503) rather than
 * attempting a call that would fail anyway or, worse, silently
 * fabricating a "recording" that was never actually captured.
 *
 * ## What's needed to turn this on
 * Set LIVEKIT_EGRESS_S3_BUCKET, LIVEKIT_EGRESS_S3_REGION,
 * LIVEKIT_EGRESS_S3_ACCESS_KEY, LIVEKIT_EGRESS_S3_SECRET (and
 * optionally LIVEKIT_EGRESS_S3_ENDPOINT for an S3-compatible provider
 * other than AWS) to a real bucket LiveKit's Egress service can write
 * to. Once set, startRecording()/stopRecording() need no code changes -
 * they already build the real StartRoomCompositeEgress request.
 */

interface EgressS3Config {
  bucket: string;
  region: string;
  accessKey: string;
  secret: string;
  endpoint?: string;
}

function getEgressS3Config(): EgressS3Config | null {
  const bucket = process.env.LIVEKIT_EGRESS_S3_BUCKET;
  const region = process.env.LIVEKIT_EGRESS_S3_REGION;
  const accessKey = process.env.LIVEKIT_EGRESS_S3_ACCESS_KEY;
  const secret = process.env.LIVEKIT_EGRESS_S3_SECRET;
  if (!bucket || !region || !accessKey || !secret) return null;
  const endpoint = process.env.LIVEKIT_EGRESS_S3_ENDPOINT;
  return { bucket, region, accessKey, secret, ...(endpoint ? { endpoint } : {}) };
}

async function getRoomOrThrow(roomType: LiveRoomType, roomId: string) {
  const room =
    roomType === "AUDIO"
      ? await prisma.liveAudioRoom.findUnique({ where: { id: roomId } })
      : await prisma.liveVideoRoom.findUnique({ where: { id: roomId } });
  if (!room) throw LiveReplayErrors.roomNotFound();
  return room;
}

async function requireHostOrModerator(roomType: LiveRoomType, roomId: string, actorId: string) {
  const participant =
    roomType === "AUDIO"
      ? await prisma.liveAudioParticipant.findFirst({ where: { roomId, userId: actorId, leftAt: null, removedAt: null } })
      : await prisma.liveVideoParticipant.findFirst({ where: { roomId, userId: actorId, leftAt: null, removedAt: null } });
  if (!participant || !["HOST", "MODERATOR"].includes(participant.role)) {
    throw LiveReplayErrors.forbidden();
  }
}

export interface StartRecordingResult {
  recordingId: string;
  egressId: string;
}

/**
 * Starts a RoomCompositeEgress recording of a LIVE room. Fails closed
 * with `replay_not_configured` (503) when the S3 destination isn't set
 * up - see this file's header comment. When it IS configured, this
 * calls the real LiveKit Egress API and persists the real egressId
 * LiveKit returns; the recording completes asynchronously via the
 * `egress_ended` webhook (see the extended handler in
 * src/app/api/live-audio/webhooks/livekit/route.ts).
 */
export async function startRecording(params: { actorId: string; roomType: LiveRoomType; roomId: string }): Promise<StartRecordingResult> {
  const { actorId, roomType, roomId } = params;

  const room = await getRoomOrThrow(roomType, roomId);
  if (room.status !== "LIVE") throw LiveReplayErrors.roomNotLive();
  await requireHostOrModerator(roomType, roomId, actorId);

  const existing = await prisma.liveRecording.findFirst({
    where: {
      ...(roomType === "AUDIO" ? { liveAudioRoomId: roomId } : { liveVideoRoomId: roomId }),
      status: { in: ["EGRESS_STARTING", "EGRESS_ACTIVE"] },
    },
  });
  if (existing) throw LiveReplayErrors.alreadyRecording();

  const liveKitConfig = getLiveKitConfig();
  const s3Config = getEgressS3Config();
  if (!liveKitConfig || !s3Config) throw LiveReplayErrors.notConfigured();

  const { EgressClient } = await import("livekit-server-sdk");
  const { EncodedFileOutput, EncodedFileType, S3Upload } = await import("@livekit/protocol");

  const client = new EgressClient(liveKitConfig.url, liveKitConfig.apiKey, liveKitConfig.apiSecret);

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `live-replays/${roomType.toLowerCase()}/${roomId}/{time}.mp4`,
    output: {
      case: "s3",
      value: new S3Upload({
        bucket: s3Config.bucket,
        region: s3Config.region,
        accessKey: s3Config.accessKey,
        secret: s3Config.secret,
        ...(s3Config.endpoint ? { endpoint: s3Config.endpoint } : {}),
      }),
    },
  });

  const egressInfo = await client.startRoomCompositeEgress(roomId, { file: output }, { layout: "speaker" });

  const recording = await prisma.liveRecording.create({
    data: {
      liveAudioRoomId: roomType === "AUDIO" ? roomId : null,
      liveVideoRoomId: roomType === "VIDEO" ? roomId : null,
      egressId: egressInfo.egressId,
      status: "EGRESS_STARTING",
    },
  });

  const emitToRoom = roomType === "AUDIO" ? emitToLiveAudioRoom : emitToLiveVideoRoom;
  emitToRoom(roomId, "live-replay:recording-started", { recordingId: recording.id });

  return { recordingId: recording.id, egressId: egressInfo.egressId };
}

export async function stopRecording(params: { actorId: string; roomType: LiveRoomType; roomId: string }): Promise<void> {
  const { actorId, roomType, roomId } = params;
  await requireHostOrModerator(roomType, roomId, actorId);

  const recording = await prisma.liveRecording.findFirst({
    where: {
      ...(roomType === "AUDIO" ? { liveAudioRoomId: roomId } : { liveVideoRoomId: roomId }),
      status: { in: ["EGRESS_STARTING", "EGRESS_ACTIVE"] },
    },
  });
  if (!recording) throw LiveReplayErrors.notRecording();

  const liveKitConfig = getLiveKitConfig();
  if (!liveKitConfig) throw LiveReplayErrors.notConfigured();

  const { EgressClient } = await import("livekit-server-sdk");
  const client = new EgressClient(liveKitConfig.url, liveKitConfig.apiKey, liveKitConfig.apiSecret);
  await client.stopEgress(recording.egressId);

  await prisma.liveRecording.update({ where: { id: recording.id }, data: { status: "EGRESS_ENDING" } });
}

export async function listRecordings(roomType: LiveRoomType, roomId: string) {
  return prisma.liveRecording.findMany({
    where: {
      ...(roomType === "AUDIO" ? { liveAudioRoomId: roomId } : { liveVideoRoomId: roomId }),
      status: "EGRESS_COMPLETE",
      deletedAt: null,
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, mediaUrl: true, durationSeconds: true, startedAt: true, endedAt: true },
  });
}

export async function deleteRecording(params: { actorId: string; roomType: LiveRoomType; roomId: string; recordingId: string }): Promise<void> {
  const { actorId, roomType, roomId, recordingId } = params;
  await requireHostOrModerator(roomType, roomId, actorId);

  const recording = await prisma.liveRecording.findUnique({ where: { id: recordingId } });
  const matchesRoom = recording && (roomType === "AUDIO" ? recording.liveAudioRoomId === roomId : recording.liveVideoRoomId === roomId);
  if (!recording || !matchesRoom) throw LiveReplayErrors.recordingNotFound();

  await prisma.liveRecording.update({ where: { id: recordingId }, data: { deletedAt: new Date() } });
}

/**
 * Called from the LiveKit webhook handler on `egress_ended` - the ONLY
 * place a LiveRecording transitions to EGRESS_COMPLETE with a real
 * mediaUrl, never speculatively written anywhere else. Idempotent:
 * LiveKit may resend webhooks, and a second `egress_ended` for the same
 * egressId just re-applies the same update.
 */
export async function handleEgressEnded(params: {
  egressId: string;
  status: string;
  mediaUrl: string | null;
  durationSeconds: number | null;
}): Promise<void> {
  const { egressId, status, mediaUrl, durationSeconds } = params;
  await prisma.liveRecording.updateMany({
    where: { egressId },
    data: { status, mediaUrl, durationSeconds, endedAt: new Date() },
  });
}
