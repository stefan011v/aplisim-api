const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { comparePassword } = require("../../utils/passwords");
const { sendSupportEmail } = require("../../lib/mailer");
const { issuePasswordToken } = require("../auth/passwordTokens");

async function ensureSettings() {
  let settings = await prisma.appSetting.findUnique({
    where: { id: 1 },
  });

  if (!settings) {
    settings = await prisma.appSetting.create({
      data: { id: 1 },
    });
  }

  return settings;
}

function serializeClientPortalSettings(user, client) {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clientId || null,
      clientPortalRole: user.clientPortalRole || "member",
    },
    client: client
      ? {
          id: client.id,
          companyName: client.companyName,
          contactName: client.contactName,
          email: client.email,
          phone: client.phone,
          website: client.website,
          city: client.city,
          status: client.status,
          primaryService: client.primaryService,
          packageName: client.packageName,
          notes: client.notes,
        }
      : null,
  };
}

function serializeTeamUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    clientPortalRole: user.clientPortalRole || "member",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function isClientAdmin(user) {
  return user?.role === "client" && user?.clientPortalRole === "admin";
}

async function getSettings(req, res) {
  try {
    const settings = await ensureSettings();
    return res.json(settings);
  } catch (error) {
    console.error("GET_SETTINGS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while loading settings",
    });
  }
}

async function updateSettings(req, res) {
  try {
    await ensureSettings();

    const payload = req.body || {};

    const updated = await prisma.appSetting.update({
      where: { id: 1 },
      data: {
        appName:
          payload.appName === undefined
            ? undefined
            : String(payload.appName || "").trim() || null,
        supportEmail:
          payload.supportEmail === undefined
            ? undefined
            : String(payload.supportEmail || "").trim() || null,
        timezone:
          payload.timezone === undefined
            ? undefined
            : String(payload.timezone || "").trim() || "Europe/Belgrade",

        defaultTicketStatus:
          payload.defaultTicketStatus === undefined
            ? undefined
            : String(payload.defaultTicketStatus || "").trim() || "new",
        defaultTicketPriority:
          payload.defaultTicketPriority === undefined
            ? undefined
            : String(payload.defaultTicketPriority || "").trim() || "medium",
        defaultTicketCategory:
          payload.defaultTicketCategory === undefined
            ? undefined
            : String(payload.defaultTicketCategory || "").trim() || "general",

        defaultLeadStatus:
          payload.defaultLeadStatus === undefined
            ? undefined
            : String(payload.defaultLeadStatus || "").trim() || "new",
        defaultLeadSource:
          payload.defaultLeadSource === undefined
            ? undefined
            : String(payload.defaultLeadSource || "").trim() || "website",

        defaultClientStatus:
          payload.defaultClientStatus === undefined
            ? undefined
            : String(payload.defaultClientStatus || "").trim() || "prospect",
        defaultPrimaryService:
          payload.defaultPrimaryService === undefined
            ? undefined
            : String(payload.defaultPrimaryService || "").trim() || "web-app-development",
        defaultPackageName:
          payload.defaultPackageName === undefined
            ? undefined
            : String(payload.defaultPackageName || "").trim() || null,

        notifyOnAccessRequest:
          payload.notifyOnAccessRequest === undefined
            ? undefined
            : Boolean(payload.notifyOnAccessRequest),
        notifyOnNewTicket:
          payload.notifyOnNewTicket === undefined
            ? undefined
            : Boolean(payload.notifyOnNewTicket),
        notifyOnLeadCreated:
          payload.notifyOnLeadCreated === undefined
            ? undefined
            : Boolean(payload.notifyOnLeadCreated),
      },
    });

    return res.json({
      message: "Settings updated successfully",
      settings: updated,
    });
  } catch (error) {
    console.error("UPDATE_SETTINGS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while updating settings",
    });
  }
}

async function getMySettings(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    let client = null;

    if (user.clientId) {
      client = await prisma.client.findUnique({
        where: { id: user.clientId },
      });
    }

    return res.json(serializeClientPortalSettings(user, client));
  } catch (error) {
    console.error("GET_MY_SETTINGS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while loading account settings",
    });
  }
}

async function updateMySettings(req, res) {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const payload = req.body || {};

    const nextName =
      payload.name === undefined
        ? currentUser.name
        : String(payload.name || "").trim();

    const nextEmail =
      payload.email === undefined
        ? currentUser.email
        : String(payload.email || "").trim().toLowerCase();

    if (!nextName) {
      return res.status(400).json({
        message: "Name is required",
      });
    }

    if (!nextEmail) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(nextEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    const existingUserWithEmail = await prisma.user.findUnique({
      where: { email: nextEmail },
    });

    if (existingUserWithEmail && existingUserWithEmail.id !== currentUser.id) {
      return res.status(409).json({
        message: "Another user already uses this email address",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: currentUser.id },
        data: {
          name: nextName,
          email: nextEmail,
        },
      });

      let updatedClient = null;

      if (currentUser.clientId) {
        updatedClient = await tx.client.update({
          where: { id: currentUser.clientId },
          data: {
            contactName:
              payload.contactName === undefined
                ? undefined
                : String(payload.contactName || "").trim() || null,
            email:
              payload.clientEmail === undefined
                ? nextEmail
                : String(payload.clientEmail || "").trim().toLowerCase() || null,
            phone:
              payload.phone === undefined
                ? undefined
                : String(payload.phone || "").trim() || null,
            website:
              payload.website === undefined
                ? undefined
                : String(payload.website || "").trim() || null,
            city:
              payload.city === undefined
                ? undefined
                : String(payload.city || "").trim() || null,
          },
        });
      }

      return { updatedUser, updatedClient };
    });

    return res.json({
      message: "Account settings updated successfully",
      settings: serializeClientPortalSettings(
        result.updatedUser,
        result.updatedClient
      ),
    });
  } catch (error) {
    console.error("UPDATE_MY_SETTINGS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while updating account settings",
    });
  }
}

async function changeMyPassword(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Internal staff always manage their own password; on the client portal it
    // stays restricted to the main account admin.
    if (user.role === "client" && user.clientPortalRole !== "admin") {
      return res.status(403).json({
        message: "Only the main client admin can change the portal password here",
      });
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Current password, new password and confirm password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters long",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirm password do not match",
      });
    }

    const isValid = await comparePassword(currentPassword, user.passwordHash);

    if (!isValid) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
      },
    });

    return res.json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("CHANGE_MY_PASSWORD_ERROR:", error);
    return res.status(500).json({
      message: "Server error while changing password",
    });
  }
}

async function listMyTeamUsers(req, res) {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        clientId: true,
        clientPortalRole: true,
      },
    });

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!currentUser.clientId) {
      return res.status(400).json({
        message: "This account is not linked to a client",
      });
    }

    const teamUsers = await prisma.user.findMany({
      where: {
        clientId: currentUser.clientId,
        role: "client",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res.json({
      currentUser: {
        id: currentUser.id,
        clientPortalRole: currentUser.clientPortalRole || "member",
      },
      users: teamUsers.map(serializeTeamUser),
    });
  } catch (error) {
    console.error("LIST_MY_TEAM_USERS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while loading team users",
    });
  }
}

async function inviteMyTeamUser(req, res) {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        clientId: true,
        clientPortalRole: true,
      },
    });

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!currentUser.clientId) {
      return res.status(400).json({
        message: "This account is not linked to a client",
      });
    }

    if (!isClientAdmin(currentUser)) {
      return res.status(403).json({
        message: "Only the main client admin can invite team users",
      });
    }

    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required",
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

    const client = await prisma.client.findUnique({
      where: { id: currentUser.clientId },
    });

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    // The account starts with an unusable random password: the invitee sets a
    // real one through the single-use invite link.
    const placeholderPassword = crypto.randomBytes(32).toString("hex");

    const createdUser = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(placeholderPassword, 10),
        role: "client",
        clientId: currentUser.clientId,
        clientPortalRole: "member",
        mustChangePassword: true,
      },
    });

    const { url: inviteUrl } = await issuePasswordToken(
      createdUser.id,
      "invite"
    );

    await sendSupportEmail({
      to: email,
      subject: "You have been invited to the APLISIM client portal",
      text: `Hello ${name},

${currentUser.name || "A team admin"} invited you to the APLISIM client portal for ${client.companyName}.

Set your password here (link valid for 7 days):
${inviteUrl}

After setting your password you will have member access to the client portal.

Best regards,
APLISIM Support`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <p>Hello ${name},</p>
          <p><strong>${currentUser.name || "A team admin"}</strong> invited you to the APLISIM client portal for <strong>${client.companyName}</strong>.</p>
          <p><a href="${inviteUrl}">Set your password</a> to activate the account. The link is valid for 7 days.</p>
          <p style="color:#6b7280;font-size:13px;">Sign in afterwards with <strong>${email}</strong>.</p>
          <p>Best regards,<br />APLISIM Support</p>
        </div>
      `,
    });

    return res.status(201).json({
      message: "Invite sent successfully",
      user: serializeTeamUser(createdUser),
    });
  } catch (error) {
    console.error("INVITE_MY_TEAM_USER_ERROR:", error);
    return res.status(500).json({
      message: "Server error while sending invite",
    });
  }
}

async function deleteMyTeamUser(req, res) {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        clientId: true,
        clientPortalRole: true,
      },
    });

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!currentUser.clientId) {
      return res.status(400).json({
        message: "This account is not linked to a client",
      });
    }

    if (!isClientAdmin(currentUser)) {
      return res.status(403).json({
        message: "Only the main client admin can delete team users",
      });
    }

    const userId = Number(req.params.userId);

    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    if (userId === currentUser.id) {
      return res.status(400).json({
        message: "You cannot delete your own main account",
      });
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        id: userId,
        clientId: currentUser.clientId,
        role: "client",
      },
    });

    if (!targetUser) {
      return res.status(404).json({
        message: "Team user not found",
      });
    }

    if ((targetUser.clientPortalRole || "member") === "admin") {
      return res.status(403).json({
        message: "The main client admin cannot be deleted from the client portal",
      });
    }

    await prisma.user.delete({
      where: {
        id: targetUser.id,
      },
    });

    return res.json({
      message: "Team user deleted successfully",
      deletedId: targetUser.id,
    });
  } catch (error) {
    console.error("DELETE_MY_TEAM_USER_ERROR:", error);
    return res.status(500).json({
      message: "Server error while deleting team user",
    });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getMySettings,
  updateMySettings,
  changeMyPassword,
  listMyTeamUsers,
  inviteMyTeamUser,
  deleteMyTeamUser,
};