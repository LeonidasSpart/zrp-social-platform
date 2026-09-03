// Curated, canonical genre tags suggested when publishing or editing a
// track. Deliberately not translated: MusicTrack.genre is a plain free
// text field used for real discovery (Discover's browse-by-genre chips,
// the genre groupBy on Music Home, track/genre search) - if the same
// genre were stored as "Pop" for one artist and a translated label for
// another, they'd end up in different genre buckets that never match
// each other. This list only powers a <datalist> suggestion dropdown;
// an artist can still type any genre they want.
export const MUSIC_GENRES = [
  "Pop",
  "Hip-Hop",
  "R&B",
  "Rock",
  "Alternative",
  "Indie",
  "Electronic",
  "House",
  "Techno",
  "Dance",
  "Ambient",
  "Jazz",
  "Blues",
  "Soul",
  "Funk",
  "Classical",
  "Country",
  "Folk",
  "Metal",
  "Punk",
  "Reggae",
  "Reggaeton",
  "Latin",
  "Afrobeats",
  "K-Pop",
  "Gospel",
  "World",
] as const;
