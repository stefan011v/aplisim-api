const crypto = require("crypto");
const prisma = require("../../config/prisma");

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function buildAppUrl(path) {
  const base = String(process.env.APP_BASE_URL || "https://app.aplisim.com")
    .trim()
    .replace(/\/$/, "");

  return `${base}${path}`;
}

/**
 * Issues a single-use token and invalidates any earlier unused token of the
 * same purpose, so an older email cannot be replayed after a new one is sent.
 */
async function issuePasswordToken(userId, purpose = "reset") {
  const token = crypto.randomBytes(32).toString("hex");
  const ttl = purpose === "invite" ? INVITE_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS;

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId,
      purpose,
      usedAt: null,
    },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttl),
    },
  });

  return {
    token,
    url: buildAppUrl(`/reset-password?token=${token}`),
  };
}

async function consumePasswordToken(token) {
  if (!token || typeof token !== "string") return null;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return record;
}

module.exports = {
  hashToken,
  buildAppUrl,
  issuePasswordToken,
  consumePasswordToken,
};
