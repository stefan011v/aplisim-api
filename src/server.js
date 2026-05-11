require("dotenv").config();

const app = require("./app");
const { startImapPolling, stopImapPolling } = require("./services/imap.service");

const PORT = process.env.PORT || 4000;

const shouldStartImap =
  process.env.IMAP_HOST &&
  process.env.IMAP_PORT &&
  process.env.IMAP_USER &&
  process.env.IMAP_PASS;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  if (shouldStartImap) {
    startImapPolling();
  } else {
    console.log("IMAP polling skipped - IMAP env vars not fully configured.");
  }
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);

  try {
    if (shouldStartImap) {
      await stopImapPolling();
    }
  } catch (error) {
    console.error("IMAP shutdown error:", error.message);
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));