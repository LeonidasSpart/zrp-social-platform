/*
 * One-off seeder: creates a starter batch of ZRP PLAY challenges so the
 * five game types (TRIVIA, MEMORY, LOGIC, REACTION, SEQUENCE) actually
 * have something playable in "Défis tendance" - a fresh migration adds
 * the game *type*, not any content, and PLAY has no other seed data
 * source (every existing challenge was created by hand through the UI).
 *
 * Idempotent by title: safe to re-run - existing rows with the same
 * title + type are left untouched, only missing ones are created.
 *
 * Usage (needs DATABASE_URL pointed at the target database):
 *   npx tsx scripts/seed-play-challenges.ts --dry-run   # print only, zero writes
 *   npx tsx scripts/seed-play-challenges.ts             # create
 *
 * Attribution: if a user named "ZRP" exists (the account already used
 * for the existing trending challenges), new challenges are attributed
 * to it so they render "par @ZRP" the same way. Otherwise creatorId is
 * left null (a system challenge, same as the daily-challenge pattern).
 */

import { PrismaClient, type PlayChallengeType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { validateChallengeContent } from "../src/lib/play/scoring";

// Prisma 7+ requires an explicit driver adapter - see src/lib/db.ts.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }),
});
const dryRun = process.argv.includes("--dry-run");

interface SeedChallenge {
  type: PlayChallengeType;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  content: unknown;
}

const CHALLENGES: SeedChallenge[] = [
  {
    type: "TRIVIA",
    title: "World Capitals Challenge",
    description: "Test your world geography knowledge with five quick capital-city questions.",
    difficulty: "easy",
    content: {
      questions: [
        { q: "What is the capital of Japan?", options: ["Tokyo", "Osaka", "Kyoto", "Nagoya"], correctIndex: 0 },
        { q: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], correctIndex: 2 },
        { q: "What is the capital of Canada?", options: ["Toronto", "Vancouver", "Ottawa", "Montreal"], correctIndex: 2 },
        { q: "What is the capital of Brazil?", options: ["Rio de Janeiro", "São Paulo", "Brasília", "Salvador"], correctIndex: 2 },
        { q: "What is the capital of Egypt?", options: ["Cairo", "Alexandria", "Giza", "Luxor"], correctIndex: 0 },
      ],
    },
  },
  {
    type: "TRIVIA",
    title: "Science Facts Trivia",
    description: "Five science questions covering biology, chemistry, physics and astronomy.",
    difficulty: "medium",
    content: {
      questions: [
        { q: "What gas do plants absorb from the atmosphere for photosynthesis?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], correctIndex: 1 },
        { q: "What is the chemical symbol for gold?", options: ["Ag", "Au", "Gd", "Go"], correctIndex: 1 },
        { q: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], correctIndex: 1 },
        { q: "What planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], correctIndex: 2 },
        { q: "What is the approximate speed of light?", options: ["300,000 km/s", "150,000 km/s", "3,000 km/s", "30,000 km/s"], correctIndex: 0 },
      ],
    },
  },
  {
    type: "MEMORY",
    title: "Emoji Memory Match",
    description: "Flip the cards and find every matching emoji pair as fast as you can.",
    difficulty: "easy",
    content: { pairs: ["🎮", "🎵", "⚽", "🎨", "🍕", "🚀"] },
  },
  {
    type: "MEMORY",
    title: "Flag Memory Challenge",
    description: "Match all eight flags from memory. How efficient can you be?",
    difficulty: "medium",
    content: { pairs: ["🇫🇷", "🇯🇵", "🇧🇷", "🇨🇭", "🇰🇷", "🇮🇹", "🇨🇦", "🇦🇺"] },
  },
  {
    type: "LOGIC",
    title: "Number Sequence Puzzle",
    description: "A classic numerical pattern puzzle. Can you spot the rule?",
    difficulty: "medium",
    content: {
      prompt: "What number comes next in the sequence: 2, 4, 8, 16, ...?",
      options: ["24", "30", "32", "36"],
      correctIndex: 2,
    },
  },
  {
    type: "LOGIC",
    title: "Classic Riddles",
    description: "A timeless riddle with one twist. Read carefully.",
    difficulty: "hard",
    content: {
      prompt: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
      options: ["A shadow", "An echo", "A ghost", "A dream"],
      correctIndex: 1,
    },
  },
  {
    type: "REACTION",
    title: "Lightning Reflexes",
    description: "Tap the moment the circle turns green. Five rounds, no false starts.",
    difficulty: "medium",
    content: { rounds: 5 },
  },
  {
    type: "REACTION",
    title: "Quick Draw Challenge",
    description: "Eight rounds of pure reflex. Stay sharp and don't jump the gun.",
    difficulty: "hard",
    content: { rounds: 8 },
  },
  {
    type: "SEQUENCE",
    title: "Simon Says: Colors",
    description: "Watch the four-step color sequence, then repeat it exactly.",
    difficulty: "easy",
    content: { sequence: ["🔴", "🟢", "🔵", "🟡"] },
  },
  {
    type: "SEQUENCE",
    title: "Memory Chain Challenge",
    description: "An eight-step color chain. One slip and the chain breaks.",
    difficulty: "medium",
    content: { sequence: ["🔴", "🔵", "🟢", "🟡", "🟣", "🟠", "⚪", "⚫"] },
  },
];

async function main() {
  // Fail loudly before writing anything rather than mid-batch - every
  // entry must pass the exact same validation a real user's submission
  // would go through.
  for (const c of CHALLENGES) {
    const error = validateChallengeContent(c.type, c.content);
    if (error) {
      throw new Error(`Seed data for "${c.title}" (${c.type}) failed validation: ${error}`);
    }
  }

  const zrpAccount = await prisma.user.findFirst({
    where: { username: { equals: "ZRP", mode: "insensitive" } },
    select: { id: true, username: true },
  });
  const creatorId = zrpAccount?.id ?? null;
  console.log(
    zrpAccount
      ? `Attributing new challenges to @${zrpAccount.username} (${zrpAccount.id}).`
      : "No 'ZRP' account found - new challenges will be created as system challenges (no creator)."
  );

  let created = 0;
  let skipped = 0;

  for (const c of CHALLENGES) {
    const existing = await prisma.playChallenge.findFirst({
      where: { title: c.title, type: c.type },
      select: { id: true },
    });
    if (existing) {
      console.log(`SKIP (already exists): [${c.type}] ${c.title}`);
      skipped += 1;
      continue;
    }

    console.log(`${dryRun ? "WOULD CREATE" : "CREATE"}: [${c.type}] ${c.title}`);
    if (!dryRun) {
      await prisma.playChallenge.create({
        data: {
          creatorId,
          type: c.type,
          title: c.title,
          description: c.description,
          difficulty: c.difficulty,
          content: c.content as any,
        },
      });
    }
    created += 1;
  }

  console.log(
    JSON.stringify({ dryRun, totalDefined: CHALLENGES.length, created, skipped }, null, 2)
  );
}

main()
  .catch((err) => {
    console.error("seed-play-challenges failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
