# ZRP Music — full native module

This is a real backend integration, not mock data.

## Storage
Music audio and artwork use the existing ZRP UploadThing endpoint:
`/api/uploadthing`

The integration adds a dedicated `musicTrack` UploadThing route. It does not reuse `chatAudio`.

## Database
Prisma/PostgreSQL models:
- MusicArtist
- MusicAlbum
- MusicTrack
- MusicPlaylist
- MusicPlaylistTrack
- MusicLike
- MusicFollow
- MusicHistory

## Install
Copy this package into the root of the ZRP repository, then:

node integrate-zrp-music.mjs
npx prisma migrate deploy
npx prisma generate
npm run build

Then add the Music provider to the global layout and add `/music` to your navigation.

## Important
The provider/component files are production-backed. They read/write Prisma APIs and upload to UploadThing. There is no seeded/mock catalogue.

Before production deployment, verify your UploadThing account permits the selected 500MB audio limit. You can lower it in `src/lib/uploadthing.ts` if your storage plan requires it.
