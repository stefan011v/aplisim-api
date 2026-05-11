const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const { sendSupportEmail } = require("../../lib/mailer");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function generateTemporaryPassword(length = 12) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let password = "";

  for (let i = 0; i < length; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
}

async function sendClientWelcomeEmail({
  to,
  fullName,
  companyName,
  temporaryPassword,
}) {
  const loginUrl =
    process.env.APP_LOGIN_URL || "https://app.aplisim.com/login";

  const safeName = fullName || companyName || "there";

  const text = `Hello ${safeName},

Your client portal access has been approved.

You can now log in to the APLISIM client portal using these details:

Login page: ${loginUrl}
Email: ${to}
Temporary password: ${temporaryPassword}

For security, please log in and change your password after your first sign-in.

Best regards,
APLISIM Support`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <p>Hello ${safeName},</p>
      <p>Your client portal access has been approved.</p>
      <p>You can now log in to the APLISIM client portal using these details:</p>
      <div style="margin: 16px 0; padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb;">
        <p style="margin: 0 0 8px;"><strong>Login page:</strong> ${loginUrl}</p>
        <p style="margin: 0 0 8px;"><strong>Email:</strong> ${to}</p>
        <p style="margin: 0;"><strong>Temporary password:</strong> ${temporaryPassword}</p>
      </div>
      <p>For security, please log in and change your password after your first sign-in.</p>
      <p>Best regards,<br />APLISIM Support</p>
    </div>
  `;

  await sendSupportEmail({
    to,
    subject: "Your APLISIM client portal access",
    text,
    html,
  });
}

async function createAccessRequest(req, res) {
  try {
    const fullName = String(req.body?.fullName || "").trim();
    const email = normalizeEmail(req.body?.email);
    const company = normalizeText(req.body?.company);
    const message = normalizeText(req.body?.message);

    if (!fullName || !email) {
      return res.status(400).json({
        message: "Full name and email are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    const latestOpenRequest = await prisma.accessRequest.findFirst({
      where: {
        email,
        status: {
          in: ["new", "reviewing"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (latestOpenRequest) {
      return res.status(409).json({
        message: "An open access request for this email already exists",
      });
    }

    const accessRequest = await prisma.accessRequest.create({
      data: {
        fullName,
        email,
        company,
        message,
      },
      include: {
        client: true,
      },
    });

    return res.status(201).json({
      message: "Access request submitted successfully",
      accessRequest,
    });
  } catch (error) {
    console.error("CREATE_ACCESS_REQUEST_ERROR:", error);
    return res.status(500).json({
      message: "Server error while submitting access request",
    });
  }
}

async function listAccessRequests(req, res) {
  try {
    const accessRequests = await prisma.accessRequest.findMany({
      include: {
        client: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      accessRequests,
    });
  } catch (error) {
    console.error("LIST_ACCESS_REQUESTS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while loading access requests",
    });
  }
}

async function updateAccessRequestStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "").trim().toLowerCase();

    if (!id || Number.isNaN(id)) {
      return res.status(400).json({
        message: "Invalid request ID",
      });
    }

    const allowedStatuses = ["new", "reviewing", "approved", "rejected"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status value",
      });
    }

    const existing = await prisma.accessRequest.findUnique({
      where: { id },
      include: {
        client: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Access request not found",
      });
    }

    const isReviewedStatus = ["reviewing", "approved", "rejected"].includes(status);

    const updated = await prisma.accessRequest.update({
      where: { id },
      data: {
        status,
        reviewedAt: isReviewedStatus ? new Date() : null,
        reviewedBy: isReviewedStatus
          ? req.user?.email || req.user?.name || "admin"
          : null,
      },
      include: {
        client: true,
      },
    });

    return res.json({
      message: "Access request status updated",
      accessRequest: updated,
    });
  } catch (error) {
    console.error("UPDATE_ACCESS_REQUEST_STATUS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while updating status",
    });
  }
}

async function convertAccessRequestToClient(req, res) {
  try {
    const id = Number(req.params.id);

    if (!id || Number.isNaN(id)) {
      return res.status(400).json({
        message: "Invalid request ID",
      });
    }

    const existing = await prisma.accessRequest.findUnique({
      where: { id },
      include: {
        client: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Access request not found",
      });
    }

    if (existing.clientId) {
      return res.status(409).json({
        message: "This request is already linked to a client",
      });
    }

    const companyName =
      String(req.body?.companyName || "").trim() ||
      existing.company ||
      existing.fullName;

    const contactName =
      String(req.body?.contactName || "").trim() || existing.fullName;

    const email = normalizeEmail(req.body?.email) || existing.email;
    const notes =
      String(req.body?.notes || "").trim() ||
      existing.message ||
      "Created from access request";

    if (!companyName) {
      return res.status(400).json({
        message: "Company name is required to create a client",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "Email is required to create a client",
      });
    }

    const existingClientByEmail = await prisma.client.findFirst({
      where: {
        email,
      },
    });

    if (existingClientByEmail) {
      return res.status(409).json({
        message:
          "A client with this email already exists. Open the existing client instead of creating a duplicate.",
        client: existingClientByEmail,
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({
        message:
          "A user with this email already exists. Use a different email or link that existing account manually.",
      });
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const createdClient = await tx.client.create({
        data: {
          companyName,
          contactName: contactName || null,
          email,
          notes: notes || null,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          name: contactName || companyName,
          email,
          passwordHash,
          role: "client",
          clientId: createdClient.id,
          clientPortalRole: "admin",
        },
      });

      const updatedRequest = await tx.accessRequest.update({
        where: { id },
        data: {
          clientId: createdClient.id,
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy: req.user?.email || req.user?.name || "admin",
        },
        include: {
          client: true,
        },
      });

      return {
        client: createdClient,
        user: createdUser,
        accessRequest: updatedRequest,
      };
    });

    try {
      await sendClientWelcomeEmail({
        to: email,
        fullName: contactName || existing.fullName,
        companyName,
        temporaryPassword,
      });
    } catch (mailError) {
      console.error("SEND_CLIENT_WELCOME_EMAIL_ERROR:", mailError);

      return res.status(201).json({
        message:
          "Client and login were created, but the welcome email could not be sent.",
        client: result.client,
        accessRequest: result.accessRequest,
        login: {
          email,
          temporaryPassword,
          emailSent: false,
        },
      });
    }

    return res.status(201).json({
      message: "Client created and login email sent successfully",
      client: result.client,
      accessRequest: result.accessRequest,
      login: {
        email,
        temporaryPassword,
        emailSent: true,
      },
    });
  } catch (error) {
    console.error("CONVERT_ACCESS_REQUEST_TO_CLIENT_ERROR:", error);
    return res.status(500).json({
      message: "Server error while converting request to client",
    });
  }
}

async function deleteAccessRequest(req, res) {
  try {
    const id = Number(req.params.id);

    if (!id || Number.isNaN(id)) {
      return res.status(400).json({
        message: "Invalid request ID",
      });
    }

    const existing = await prisma.accessRequest.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Access request not found",
      });
    }

    await prisma.accessRequest.delete({
      where: { id },
    });

    return res.json({
      message: "Access request deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("DELETE_ACCESS_REQUEST_ERROR:", error);
    return res.status(500).json({
      message: "Server error while deleting access request",
    });
  }
}

module.exports = {
  createAccessRequest,
  listAccessRequests,
  updateAccessRequestStatus,
  convertAccessRequestToClient,
  deleteAccessRequest,
};