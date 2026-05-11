require("dotenv").config();

const prisma = require("../config/prisma");
const { hashPassword } = require("../utils/passwords");

async function main() {
  const name = String(process.env.SEED_CLIENT_NAME || "").trim();
  const email = String(process.env.SEED_CLIENT_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SEED_CLIENT_PASSWORD || "");
  const role = "client";
  const clientId = Number(process.env.SEED_CLIENT_ID);
  const clientPortalRole =
    String(process.env.SEED_CLIENT_PORTAL_ROLE || "member").trim() || "member";

  if (!name) {
    throw new Error("SEED_CLIENT_NAME is not set");
  }

  if (!email) {
    throw new Error("SEED_CLIENT_EMAIL is not set");
  }

  if (!password) {
    throw new Error("SEED_CLIENT_PASSWORD is not set");
  }

  if (!clientId || Number.isNaN(clientId)) {
    throw new Error("SEED_CLIENT_ID is not set or invalid");
  }

  if (!["admin", "member"].includes(clientPortalRole)) {
    throw new Error("SEED_CLIENT_PORTAL_ROLE must be admin or member");
  }

  const existingClient = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });

  if (!existingClient) {
    throw new Error(`Client with id ${clientId} does not exist`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log("User already exists:", existingUser.email);
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      clientId,
      clientPortalRole,
    },
  });

  console.log("User created successfully:");
  console.log({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    clientPortalRole: user.clientPortalRole,
  });
}

main()
  .catch((error) => {
    console.error("CREATE_USER_ERROR:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });