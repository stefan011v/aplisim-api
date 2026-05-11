const fs = require("fs");
const path = require("path");
const prisma = require("../../config/prisma");
const { sendSupportEmail } = require("../../lib/mailer");
const {
  extractTicketIdFromSubject,
  stripTicketTagFromSubject,
} = require("./tickets.email.utils");

const ALLOWED_TICKET_STATUSES = [
  "new",
  "in_progress",
  "waiting_client",
  "resolved",
  "closed",
];

const ALLOWED_TICKET_PRIORITIES = ["low", "medium", "high", "urgent"];

const ALLOWED_TICKET_CATEGORIES = [
  "general",
  "hardware",
  "software",
  "network",
  "access",
  "email",
  "backup",
  "website",
  "crm",
  "server",
  "security",
  "other",
];

function normalizeAllowedValue(value, allowedValues, fallbackValue) {
  const normalized = String(value || "").trim();
  return allowedValues.includes(normalized) ? normalized : fallbackValue;
}

function safeTrim(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("SAFE_UNLINK_ERROR:", error.message);
  }
}

async function getTickets(req, res) {
  try {
    const where =
      req.user.role === "client"
        ? {
            clientId: req.user.clientId || -1,
          }
        : {};

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
        contact: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        messages: {
          select: {
            id: true,
          },
        },
        attachments: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(tickets);
  } catch (error) {
    console.error("GET_TICKETS_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch tickets",
    });
  }
}

async function getTicketById(req, res) {
  try {
    const ticketId = Number(req.params.id);

    if (!ticketId || Number.isNaN(ticketId)) {
      return res.status(400).json({
        message: "Invalid ticket id",
      });
    }

    const where =
      req.user.role === "client"
        ? {
            id: ticketId,
            clientId: req.user.clientId || -1,
          }
        : {
            id: ticketId,
          };

    const ticket =
      req.user.role === "client"
        ? await prisma.ticket.findFirst({
            where,
            include: {
              client: {
                select: {
                  id: true,
                  companyName: true,
                },
              },
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  phone: true,
                  role: true,
                },
              },
              messages: {
                where: {
                  isInternal: false,
                },
                orderBy: {
                  createdAt: "asc",
                },
              },
              attachments: {
                orderBy: {
                  createdAt: "desc",
                },
              },
            },
          })
        : await prisma.ticket.findUnique({
            where,
            include: {
              client: {
                select: {
                  id: true,
                  companyName: true,
                },
              },
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  phone: true,
                  role: true,
                },
              },
              messages: {
                orderBy: {
                  createdAt: "asc",
                },
              },
              attachments: {
                orderBy: {
                  createdAt: "desc",
                },
              },
            },
          });

    if (!ticket) {
      return res.status(404).json({
        message: "Ticket not found",
      });
    }

    return res.json(ticket);
  } catch (error) {
    console.error("GET_TICKET_BY_ID_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch ticket",
    });
  }
}

async function getTicketsCount(req, res) {
  try {
    const count = await prisma.ticket.count();
    return res.json({ count });
  } catch (error) {
    console.error("GET_TICKETS_COUNT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch tickets count",
    });
  }
}

async function createTicket(req, res) {
  try {
    const {
      clientId,
      contactId,
      title,
      description,
      status,
      priority,
      category,
      assignedTo,
      dueDate,
    } = req.body;

    const parsedClientId =
      req.user.role === "client" ? Number(req.user.clientId) : Number(clientId);

    const parsedContactId =
      contactId === null || contactId === undefined || contactId === ""
        ? null
        : Number(contactId);

    if (!parsedClientId || Number.isNaN(parsedClientId)) {
      return res.status(400).json({
        message: "Client is required",
      });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: "Ticket title is required",
      });
    }

    const existingClient = await prisma.client.findUnique({
      where: { id: parsedClientId },
    });

    if (!existingClient) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    if (req.user.role === "client" && parsedClientId !== Number(req.user.clientId)) {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    if (parsedContactId) {
      const existingContact = await prisma.clientContact.findFirst({
        where: {
          id: parsedContactId,
          clientId: parsedClientId,
        },
      });

      if (!existingContact) {
        return res.status(400).json({
          message: "Selected contact does not belong to this client",
        });
      }
    }

    const normalizedStatus =
      req.user.role === "client"
        ? "new"
        : normalizeAllowedValue(status, ALLOWED_TICKET_STATUSES, "new");

    const normalizedPriority =
      req.user.role === "client"
        ? "medium"
        : normalizeAllowedValue(priority, ALLOWED_TICKET_PRIORITIES, "medium");

    const normalizedCategory = normalizeAllowedValue(
      category,
      ALLOWED_TICKET_CATEGORIES,
      "general"
    );

    const ticket = await prisma.ticket.create({
      data: {
        clientId: parsedClientId,
        contactId: parsedContactId,
        title: title.trim(),
        description: safeTrim(description),
        status: normalizedStatus,
        priority: normalizedPriority,
        category: normalizedCategory,
        assignedTo: req.user.role === "client" ? null : safeTrim(assignedTo),
        dueDate:
          req.user.role === "client" ? null : dueDate ? new Date(dueDate) : null,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
        contact: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        messages: true,
        attachments: true,
      },
    });

    return res.status(201).json(ticket);
  } catch (error) {
    console.error("CREATE_TICKET_ERROR:", error);
    return res.status(500).json({
      message: "Failed to create ticket",
    });
  }
}

async function updateTicket(req, res) {
  try {
    const ticketId = Number(req.params.id);

    if (!ticketId || Number.isNaN(ticketId)) {
      return res.status(400).json({
        message: "Invalid ticket id",
      });
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!existingTicket) {
      return res.status(404).json({
        message: "Ticket not found",
      });
    }

    const {
      title,
      description,
      status,
      priority,
      contactId,
      category,
      assignedTo,
      dueDate,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: "Ticket title is required",
      });
    }

    const parsedContactId =
      contactId === null || contactId === undefined || contactId === ""
        ? null
        : Number(contactId);

    if (parsedContactId) {
      const existingContact = await prisma.clientContact.findFirst({
        where: {
          id: parsedContactId,
          clientId: existingTicket.clientId,
        },
      });

      if (!existingContact) {
        return res.status(400).json({
          message: "Selected contact does not belong to this client",
        });
      }
    }

    const nextStatus = normalizeAllowedValue(
      status,
      ALLOWED_TICKET_STATUSES,
      "new"
    );

    const data = {
      title: title.trim(),
      description: safeTrim(description),
      status: nextStatus,
      priority: normalizeAllowedValue(
        priority,
        ALLOWED_TICKET_PRIORITIES,
        "medium"
      ),
      contactId: parsedContactId,
      category: normalizeAllowedValue(
        category,
        ALLOWED_TICKET_CATEGORIES,
        "general"
      ),
      assignedTo: safeTrim(assignedTo),
      dueDate: dueDate ? new Date(dueDate) : null,
    };

    if (
      !existingTicket.resolvedAt &&
      (nextStatus === "resolved" || nextStatus === "closed")
    ) {
      data.resolvedAt = new Date();
    }

    if (
      existingTicket.resolvedAt &&
      nextStatus !== "resolved" &&
      nextStatus !== "closed"
    ) {
      data.resolvedAt = null;
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
        contact: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
        attachments: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    return res.json(updatedTicket);
  } catch (error) {
    console.error("UPDATE_TICKET_ERROR:", error);
    return res.status(500).json({
      message: "Failed to update ticket",
    });
  }
}

async function createTicketMessage(req, res) {
  try {
    const ticketId = Number(req.params.id);

    if (!ticketId || Number.isNaN(ticketId)) {
      return res.status(400).json({
        message: "Invalid ticket id",
      });
    }

    const existingTicket = await prisma.ticket.findFirst({
      where:
        req.user.role === "client"
          ? {
              id: ticketId,
              clientId: req.user.clientId || -1,
            }
          : {
              id: ticketId,
            },
    });

    if (!existingTicket) {
      return res.status(404).json({
        message: "Ticket not found",
      });
    }

    const { authorName, message, isInternal } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    const safeAuthorName =
      req.user.role === "client"
        ? req.user.name || req.user.email || "Client"
        : authorName?.trim();

    if (!safeAuthorName) {
      return res.status(400).json({
        message: "Author name is required",
      });
    }

    const createdMessage = await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorName: safeAuthorName,
        message: message.trim(),
        isInternal: req.user.role === "client" ? false : Boolean(isInternal),
      },
    });

    const shouldSetFirstResponse =
      !existingTicket.firstResponseAt &&
      !(req.user.role === "client" ? false : Boolean(isInternal));

    if (shouldSetFirstResponse) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          firstResponseAt: new Date(),
        },
      });
    }

    return res.status(201).json(createdMessage);
  } catch (error) {
    console.error("CREATE_TICKET_MESSAGE_ERROR:", error);
    return res.status(500).json({
      message: "Failed to create ticket message",
    });
  }
}

async function createTicketAttachment(req, res) {
  try {
    const ticketId = Number(req.params.id);

    if (!ticketId || Number.isNaN(ticketId)) {
      safeUnlink(req.file?.path);
      return res.status(400).json({
        message: "Invalid ticket id",
      });
    }

    const existingTicket = await prisma.ticket.findFirst({
      where:
        req.user.role === "client"
          ? {
              id: ticketId,
              clientId: req.user.clientId || -1,
            }
          : {
              id: ticketId,
            },
    });

    if (!existingTicket) {
      safeUnlink(req.file?.path);
      return res.status(404).json({
        message: "Ticket not found",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "File is required",
      });
    }

    const attachment = await prisma.ticketAttachment.create({
      data: {
        ticketId,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype || null,
        sizeBytes: req.file.size,
        filePath: req.file.path,
      },
    });

    return res.status(201).json(attachment);
  } catch (error) {
    console.error("CREATE_TICKET_ATTACHMENT_ERROR:", error);
    safeUnlink(req.file?.path);
    return res.status(500).json({
      message: "Failed to upload attachment",
    });
  }
}

async function downloadTicketAttachment(req, res) {
  try {
    const ticketId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);

    if (
      !ticketId ||
      Number.isNaN(ticketId) ||
      !attachmentId ||
      Number.isNaN(attachmentId)
    ) {
      return res.status(400).json({
        message: "Invalid attachment request",
      });
    }

    const ticket = await prisma.ticket.findFirst({
      where:
        req.user.role === "client"
          ? {
              id: ticketId,
              clientId: req.user.clientId || -1,
            }
          : {
              id: ticketId,
            },
      select: {
        id: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({
        message: "Ticket not found",
      });
    }

    const attachment = await prisma.ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
      },
    });

    if (!attachment) {
      return res.status(404).json({
        message: "Attachment not found",
      });
    }

    const absolutePath = path.resolve(attachment.filePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        message: "Stored file not found",
      });
    }

    return res.download(absolutePath, attachment.originalName);
  } catch (error) {
    console.error("DOWNLOAD_TICKET_ATTACHMENT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to download attachment",
    });
  }
}

async function sendTicketReplyEmail(req, res) {
  try {
    const ticketId = Number(req.params.id);

    if (!ticketId || Number.isNaN(ticketId)) {
      return res.status(400).json({
        message: "Invalid ticket id",
      });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        client: true,
        contact: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({
        message: "Ticket not found",
      });
    }

    if (!ticket.contact?.email) {
      return res.status(400).json({
        message: "This ticket has no contact email to send to",
      });
    }

    const { authorName, subject, message } = req.body;

    if (!authorName || !authorName.trim()) {
      return res.status(400).json({
        message: "Author name is required",
      });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({
        message: "Subject is required",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    const safeClientName = ticket.client?.companyName || "client";
    const safeContactName = ticket.contact?.fullName || "there";

    const escapedMessage = message
      .trim()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const text = `Hello ${safeContactName},

${message.trim()}

Ticket: #${ticket.id} - ${ticket.title}
Client: ${safeClientName}

Best regards,
${authorName.trim()}
APLISIM Support`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>Hello ${safeContactName},</p>
        <p style="white-space: pre-wrap;">${escapedMessage}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p><strong>Ticket:</strong> #${ticket.id} - ${ticket.title}</p>
        <p><strong>Client:</strong> ${safeClientName}</p>
        <p>Best regards,<br>${authorName.trim()}<br>APLISIM Support</p>
      </div>
    `;

    await sendSupportEmail({
      to: ticket.contact.email,
      subject: subject.trim(),
      text,
      html,
    });

    const createdMessage = await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorName: authorName.trim(),
        message: message.trim(),
        isInternal: false,
      },
    });

    if (!ticket.firstResponseAt) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          firstResponseAt: new Date(),
        },
      });
    }

    return res.json({
      message: "Email reply sent successfully",
      ticketMessage: createdMessage,
    });
  } catch (error) {
    console.error("SEND_TICKET_REPLY_EMAIL_ERROR:", error);
    return res.status(500).json({
      message: "Failed to send ticket email reply",
    });
  }
}

async function handleInboundEmail(req, res) {
  try {
    const { fromEmail, fromName, subject, text, html } = req.body;

    if (!fromEmail || !subject) {
      return res.status(400).json({
        message: "fromEmail and subject are required",
      });
    }

    const normalizedFromEmail = fromEmail.trim().toLowerCase();

    const cleanText =
      text?.trim() ||
      html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
      "";

    const ticketIdFromSubject = extractTicketIdFromSubject(subject);

    if (ticketIdFromSubject) {
      const existingTicket = await prisma.ticket.findUnique({
        where: { id: ticketIdFromSubject },
      });

      if (!existingTicket) {
        return res.status(404).json({
          message: "Referenced ticket not found",
        });
      }

      const createdMessage = await prisma.ticketMessage.create({
        data: {
          ticketId: ticketIdFromSubject,
          authorName: fromName?.trim() || normalizedFromEmail,
          message: cleanText || "(empty email body)",
          isInternal: false,
        },
      });

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketIdFromSubject },
      });

      if (!ticket.firstResponseAt) {
        await prisma.ticket.update({
          where: { id: ticketIdFromSubject },
          data: {
            firstResponseAt: new Date(),
          },
        });
      }

      return res.json({
        message: "Inbound email attached to existing ticket",
        action: "ticket_message_created",
        ticketId: ticketIdFromSubject,
        ticketMessageId: createdMessage.id,
      });
    }

    const contact = await prisma.clientContact.findFirst({
      where: {
        email: normalizedFromEmail,
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
          email: normalizedFromEmail,
        },
      });

      if (fallbackClient) {
        clientId = fallbackClient.id;
      }
    }

    if (!clientId) {
      return res.status(400).json({
        message:
          "No matching client/contact found for inbound sender email. Create client/contact first or extend fallback logic.",
      });
    }

    const createdTicket = await prisma.ticket.create({
      data: {
        clientId,
        contactId,
        title: stripTicketTagFromSubject(subject) || "Inbound support request",
        description: cleanText || "(empty email body)",
        status: "new",
        priority: "medium",
        category: "general",
      },
    });

    await prisma.ticketMessage.create({
      data: {
        ticketId: createdTicket.id,
        authorName: fromName?.trim() || normalizedFromEmail,
        message: cleanText || "(empty email body)",
        isInternal: false,
      },
    });

    return res.status(201).json({
      message: "Inbound email created a new ticket",
      action: "ticket_created",
      ticketId: createdTicket.id,
    });
  } catch (error) {
    console.error("HANDLE_INBOUND_EMAIL_ERROR:", error);
    return res.status(500).json({
      message: "Failed to process inbound email",
    });
  }
}

module.exports = {
  getTickets,
  getTicketById,
  getTicketsCount,
  createTicket,
  updateTicket,
  createTicketMessage,
  createTicketAttachment,
  downloadTicketAttachment,
  sendTicketReplyEmail,
  handleInboundEmail,
};