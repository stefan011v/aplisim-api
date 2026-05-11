require("dotenv").config();

const app = require("./app");
const { startImapPolling, stopImapPolling } = require("./services/imap.service");

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startImapPolling();
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);

  try {
    await stopImapPolling();
  } catch (error) {
    console.error("IMAP shutdown error:", error.message);
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));