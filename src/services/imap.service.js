const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const prisma = require("../config/prisma");
const {
  extractTicketIdFromSubject,
  stripTicketTagFromSubject,
} = require("../modules/tickets/tickets.email.utils");

let pollTimer = null;
let isPolling = false;
let client = null;
let openedMailbox = null;

function isSecureConnection() {
  return String(process.env.IMAP_SECURE).toLowerCase() === "true";
}

function getImapClient() {
  if (client) return client;

  const secure = isSecureConnection();
  const port = Number(process.env.IMAP_PORT || (secure ? 993 : 143));

  client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port,
    secure,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
      loginMethod: "LOGIN",
    },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    ...(secure
      ? {
          tls: {
            servername: process.env.IMAP_HOST,
            rejectUnauthorized: true,
          },
        }
      : {
          doSTARTTLS: true,
        }),
  });

  client.on("error", (error) => {
    console.error("IMAP_CLIENT_ERROR:", {
      message: error.message,
      code: error.code,
    });
  });

  client.on("close", () => {
    console.log("IMAP connection closed");
    openedMailbox = null;
  });

  return client;
}

async function ensureConnected() {
  const imap = getImapClient();
  const mailbox = process.env.IMAP_MAILBOX || "INBOX";

  if (!imap.usable) {
    console.log("IMAP connecting...");
    await imap.connect();
    console.log("IMAP connected");
    openedMailbox = null;
  }

  if (openedMailbox !== mailbox) {
    await imap.mailboxOpen(mailbox);
    openedMailbox = mailbox;
    console.log(`IMAP mailbox opened: ${mailbox}`);
  }

  return imap;
}

function cleanEmailBody(parsed) {
  const text = parsed.text?.trim();
  if (text) return text;

  const html = parsed.html;
  if (!html) return "";

  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSender(parsed) {
  const from = parsed.from?.value?.[0];

  return {
    fromEmail: from?.address?.trim() || "",
    fromName: from?.name?.trim() || from?.address?.trim() || "Unknown sender",
  };
}

async function attachReplyToExistingTicket(ticketId, fromName, bodyText) {
  const existingTicket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!existingTicket) {
    return {
      action: "ticket_not_found",
      ticketId,
    };
  }

  const duplicate = await prisma.ticketMessage.findFirst({
    where: {
      ticketId,
      authorName: fromName,
      message: bodyText || "(empty email body)",
      isInternal: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (duplicate) {
    return {
      action: "duplicate_message_skipped",
      ticketId,
      ticketMessageId: duplicate.id,
    };
  }

  const createdMessage = await prisma.ticketMessage.create({
    data: {
      ticketId,
      authorName: fromName,
      message: bodyText || "(empty email body)",
      isInternal: false,
    },
  });

  if (!existingTicket.firstResponseAt) {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        firstResponseAt: new Date(),
      },
    });
  }

  return {
    action: "ticket_message_created",
    ticketId,
    ticketMessageId: createdMessage.id,
  };
}

async function createTicketFromInboundEmail(fromEmail, fromName, subject, bodyText) {
  const contact = await prisma.clientContact.findFirst({
    where: {
      email: fromEmail,
    },
    include: {
      client: true,
    },
  });

  let clientId = null;
  let contactId = null;

  if (contact) {
    clientId = contact.clientId;
    contactId = contact.id;
  } else {
    const fallbackClient = await prisma.client.findFirst({
      where: {
        email: fromEmail,
      },
    });

    if (fallbackClient) {
      clientId = fallbackClient.id;
    }
  }

  if (!clientId) {
    return {
      action: "no_matching_client",
      fromEmail,
    };
  }

  const title = stripTicketTagFromSubject(subject) || "Inbound support request";

  const createdTicket = await prisma.ticket.create({
    data: {
      clientId,
      contactId,
      title,
      description: bodyText || "(empty email body)",
      status: "new",
      priority: "medium",
      category: "general",
    },
  });

  await prisma.ticketMessage.create({
    data: {
      ticketId: createdTicket.id,
      authorName: fromName,
      message: bodyText || "(empty email body)",
      isInternal: false,
    },
  });

  return {
    action: "ticket_created",
    ticketId: createdTicket.id,
  };
}

async function processMessage(imap, uid) {
  const message = await imap.fetchOne(uid, {
    uid: true,
    source: true,
    envelope: true,
  });

  if (!message?.source) {
    return {
      action: "empty_source_skipped",
    };
  }

  const parsed = await simpleParser(message.source);
  const { fromEmail, fromName } = extractSender(parsed);
  const subject = parsed.subject?.trim() || "";
  const bodyText = cleanEmailBody(parsed);
  const ticketId = extractTicketIdFromSubject(subject);

  if (!fromEmail) {
    await imap.messageFlagsAdd(uid, ["\\Seen"]);
    return {
      action: "missing_sender_skipped",
    };
  }

  let result;

  if (ticketId) {
    result = await attachReplyToExistingTicket(ticketId, fromName, bodyText);
  } else {
    result = await createTicketFromInboundEmail(
      fromEmail,
      fromName,
      subject,
      bodyText
    );
  }

  await imap.messageFlagsAdd(uid, ["\\Seen"]);

  return result;
}

async function pollInboxOnce() {
  if (isPolling) return;
  isPolling = true;

  try {
    const imap = await ensureConnected();
    const mailbox = process.env.IMAP_MAILBOX || "INBOX";
    const lock = await imap.getMailboxLock(mailbox);

    try {
      for await (const message of imap.fetch("1:*", { uid: true, flags: true })) {
        const flags = message.flags || new Set();
        const isSeen = flags.has("\\Seen");

        if (isSeen) continue;

        try {
          const result = await processMessage(imap, message.uid);
          console.log("IMAP_EMAIL_RESULT:", result);
        } catch (error) {
          console.error("IMAP_PROCESS_MESSAGE_ERROR:", {
            message: error.message,
            uid: message.uid,
          });
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error("IMAP_POLL_ERROR:", {
      message: error.message,
      code: error.code,
    });

    try {
      if (client) {
        await client.logout();
      }
    } catch {}

    client = null;
    openedMailbox = null;
  } finally {
    isPolling = false;
  }
}

function startImapPolling() {
  console.log("IMAP DEBUG", {
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    secure: process.env.IMAP_SECURE,
    user: process.env.IMAP_USER,
    mailbox: process.env.IMAP_MAILBOX,
  });

  const hasConfig =
    process.env.IMAP_HOST &&
    process.env.IMAP_USER &&
    process.env.IMAP_PASS;

  if (!hasConfig) {
    console.log("IMAP disabled: missing IMAP env configuration");
    return;
  }

  const interval = Number(process.env.IMAP_POLL_INTERVAL_MS || 30000);

  if (pollTimer) {
    clearInterval(pollTimer);
  }

  pollInboxOnce().catch((error) => {
    console.error("IMAP_INITIAL_POLL_ERROR:", error.message);
  });

  pollTimer = setInterval(() => {
    pollInboxOnce().catch((error) => {
      console.error("IMAP_INTERVAL_POLL_ERROR:", error.message);
    });
  }, interval);

  console.log(`IMAP polling started (every ${interval}ms)`);
}

async function stopImapPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (client) {
    try {
      await client.logout();
    } catch {}
    client = null;
  }

  openedMailbox = null;
}

module.exports = {
  startImapPolling,
  stopImapPolling,
  pollInboxOnce,
};