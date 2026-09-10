export type PresenceStatus = "online" | "offline";

export interface PresenceStore {
  ttlMs: number;
  setOnline(userId: string, instanceId: string): Promise<void>;
  setOffline(userId: string, instanceId: string): Promise<void>;
  refresh(instanceId: string, userIds: string[]): Promise<void>;
  isOnline(userId: string): Promise<boolean>;
}

export interface PresenceTracker {
  instanceId: string;
  connect(userId: string): Promise<boolean>;
  disconnect(userId: string): Promise<boolean>;
  isOnline(userId: string): Promise<boolean>;
  heartbeat(): Promise<void>;
  localUserIds(): string[];
  localCount(userId: string): number;
}

export interface PresenceBus {
  publish(userId: string, status: PresenceStatus): Promise<void>;
  close(): Promise<void>;
}

export const DEFAULT_TTL_MS: number;

export function createMemoryPresenceStore(options?: { ttlMs?: number; now?: () => number }): PresenceStore;

export function createRedisPresenceStore(
  client: unknown,
  options?: { ttlMs?: number; keyPrefix?: string }
): PresenceStore;

export function createPresenceTracker(options?: {
  instanceId?: string;
  store?: PresenceStore | null;
  onChange?: (userId: string, status: PresenceStatus) => void;
  log?: Pick<Console, "error">;
}): PresenceTracker;

export function createRedisPresenceBus(
  pub: unknown,
  sub: unknown,
  instanceId: string,
  onRemote: (userId: string, status: PresenceStatus) => void,
  options?: { channel?: string }
): Promise<PresenceBus>;
