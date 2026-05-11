require("dotenv").config();

const prisma = require("../config/prisma");
const { hashPassword } = require("../utils/passwords");

async function main() {
  const name = process.env.SEED_ADMIN_NAME || "APLISIM Admin";
  const email = String(process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SEED_ADMIN_PASSWORD || "");

  if (!email) {
    throw new Error("SEED_ADMIN_EMAIL is not set");
  }

  if (!password) {
    throw new Error("SEED_ADMIN_PASSWORD is not set");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: {
      email,
    },
    update: {
      name,
      passwordHash,
      role: "admin",
    },
    create: {
      name,
      email,
      passwordHash,
      role: "admin",
    },
  });

  console.log("Admin user ready:", user.email);
}

main()
  .catch((error) => {
    console.error("CREATE_ADMIN_ERROR:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });