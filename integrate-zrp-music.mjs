import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),"utf8");
const write = (p,s) => fs.writeFileSync(path.join(root,p),s);

function insertOnce(file, marker, text, label) {
  let s = read(file);
  if (s.includes(text.trim())) return;
  const i = s.indexOf(marker);
  if (i < 0) throw new Error(`Could not find ${label} marker in ${file}`);
  s = s.slice(0,i) + text + s.slice(i);
  write(file,s);
}

const schema = "prisma/schema.prisma";
let s = read(schema);
if (!s.includes("model MusicArtist")) {
  insertOnce(schema, "model User {", `
  // ─── ZRP MUSIC ─────────────────────────────────────────────────
  musicArtist       MusicArtist?
  musicPlaylists    MusicPlaylist[]
  musicLikes        MusicLike[]
  musicFollows      MusicFollow[]
  musicHistory      MusicHistory[]

`, "User model");

  s = read(schema);
  s += `

model MusicArtist {
  id         String   @id @default(cuid())
  userId     String   @unique
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  displayName String
  bio        String?  @db.Text
  avatarUrl  String?
  bannerUrl  String?
  verified   Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  albums     MusicAlbum[]
  tracks     MusicTrack[]
  followers  MusicFollow[]
  @@index([displayName])
}

model MusicAlbum {
  id          String   @id @default(cuid())
  artistId    String
  artist      MusicArtist @relation(fields: [artistId], references: [id], onDelete: Cascade)
  title       String
  description String?  @db.Text
  coverUrl    String?
  releaseDate DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tracks      MusicTrack[]
  @@index([artistId])
}

model MusicTrack {
  id           String   @id @default(cuid())
  artistId     String
  artist       MusicArtist @relation(fields: [artistId], references: [id], onDelete: Cascade)
  albumId      String?
  album        MusicAlbum? @relation(fields: [albumId], references: [id], onDelete: SetNull)
  title        String
  description  String?  @db.Text
  audioUrl     String
  audioKey     String?
  coverUrl     String?
  durationSec  Int?
  genre        String?
  explicit     Boolean  @default(false)
  status       String   @default("PUBLISHED")
  playCount    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  likes        MusicLike[]
  playlistItems MusicPlaylistTrack[]
  history      MusicHistory[]
  @@index([artistId])
  @@index([albumId])
  @@index([status])
  @@index([createdAt])
}

model MusicPlaylist {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  description String?  @db.Text
  coverUrl    String?
  isPublic    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tracks      MusicPlaylistTrack[]
  @@index([userId])
}

model MusicPlaylistTrack {
  id         String   @id @default(cuid())
  playlistId String
  playlist   MusicPlaylist @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  trackId    String
  track      MusicTrack @relation(fields: [trackId], references: [id], onDelete: Cascade)
  position   Int      @default(0)
  addedAt    DateTime @default(now())
  @@unique([playlistId, trackId])
  @@index([playlistId, position])
}

model MusicLike {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  trackId   String
  track     MusicTrack @relation(fields: [trackId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@unique([userId, trackId])
  @@index([trackId])
}

model MusicFollow {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  artistId  String
  artist    MusicArtist @relation(fields: [artistId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@unique([userId, artistId])
  @@index([artistId])
}

model MusicHistory {
  id            String   @id @default(cuid())
  userId        String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  trackId       String
  track         MusicTrack @relation(fields: [trackId], references: [id], onDelete: Cascade)
  secondsPlayed Int      @default(0)
  completed     Boolean  @default(false)
  createdAt     DateTime @default(now())
  @@index([userId, createdAt])
  @@index([trackId])
}
`;
}

const upload = "src/lib/uploadthing.ts";
let u = read(upload);
if (!u.includes("musicTrack: f({")) {
  const marker = "} satisfies FileRouter;";
  const block = `  // ─── ZRP MUSIC ────────────────────────────────────────────────
  musicTrack: f({
    audio: { maxFileSize: "500MB", maxFileCount: 1 },
    image: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ file }) => ({
      url: file.ufsUrl,
      key: file.key,
      type: file.type.startsWith("audio/") ? "audio" : "image",
    })),

`;
  u = u.replace(marker, block + marker);
  write(upload,u);
}

console.log("ZRP Music integration files installed.");
console.log("Next: npx prisma migrate deploy && npx prisma generate && npm run build");
