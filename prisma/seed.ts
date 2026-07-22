import { prisma } from "../src/db/prisma.js";

async function main() {
  await prisma.user.create({
    data: {
      name: "Alice Johnson",
      email: "alice@example.com",
      preference: {
        create: {
          emailEnabled: true,
          smsEnabled: true,
          pushEnabled: true,
          inAppEnabled: true,
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      name: "Bob Smith",
      email: "bob@example.com",
      preference: {
        create: {
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: true,
          inAppEnabled: true,
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      name: "Priya Nair",
      email: "priya@example.com",
      preference: {
        create: {
          emailEnabled: false,
          smsEnabled: false,
          pushEnabled: false,
          inAppEnabled: true,
        },
      },
    },
  });

  console.log("Seed complete: 3 users created.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
