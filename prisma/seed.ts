import { prisma } from "../src/db/prisma.js";

const users = [
  {
    name: "Alice Johnson",
    email: "alice@example.com",
    preferences: { emailEnabled: true, smsEnabled: true, pushEnabled: true, inAppEnabled: true },
  },
  {
    name: "Bob Smith",
    email: "bob@example.com",
    preferences: { emailEnabled: true, smsEnabled: false, pushEnabled: true, inAppEnabled: true },
  },
  {
    name: "Priya Nair",
    email: "priya@example.com",
    preferences: { emailEnabled: false, smsEnabled: false, pushEnabled: false, inAppEnabled: true },
  },
];

async function main() {
  console.log("Seeding users...\n");

  for (const { name, email, preferences } of users) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, preference: { upsert: { create: preferences, update: preferences } } },
      create: { name, email, preference: { create: preferences } },
    });

    console.log(`${user.name.padEnd(15)} id=${user.id}  email=${user.email}`);
    console.log(`  preferences: ${JSON.stringify(preferences)}\n`);
  }

  console.log("Seed complete. Use one of the ids above as `userId` in the API examples below.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
