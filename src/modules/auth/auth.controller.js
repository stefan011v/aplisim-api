const prisma = require("../../config/prisma");
const { comparePassword, hashPassword } = require("../../utils/passwords");
const { signToken } = require("../../utils/jwt");
const { sendSupportEmail } = require("../../lib/mailer");
const {
  issuePasswordToken,
  consumePasswordToken,
} = require("./passwordTokens");

const isProduction = process.env.NODE_ENV === "production";

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId || null,
    clientPortalRole: user.clientPortalRole || null,
  };
}

async function login(req, res) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isValid = await comparePassword(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const safeUser = serializeUser(user);

    const token = signToken({
      id: safeUser.id,
      email: safeUser.email,
      role: safeUser.role,
      name: safeUser.name,
      clientId: safeUser.clientId,
      clientPortalRole: safeUser.clientPortalRole,
    });

    res.cookie("token", token, getCookieOptions());

    return res.json({
      message: "Login successful",
      user: safeUser,
    });
  } catch (error) {
    console.error("LOGIN_ERROR:", error);
    return res.status(500).json({
      message: "Server error during login",
    });
  }
}

function tokenIsStale(tokenUser, dbUser) {
  return (
    tokenUser.name !== dbUser.name ||
    tokenUser.email !== dbUser.email ||
    tokenUser.role !== dbUser.role ||
    (tokenUser.clientId || null) !== (dbUser.clientId || null) ||
    (tokenUser.clientPortalRole || null) !== (dbUser.clientPortalRole || null)
  );
}

async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      res.clearCookie("token", getClearCookieOptions());

      return res.status(401).json({
        message: "Account no longer exists",
      });
    }

    const safeUser = serializeUser(user);

    // The cookie carries a 7 day token, so a profile or role change made after
    // sign-in would otherwise stay invisible to every requireRole check.
    if (tokenIsStale(req.user, safeUser)) {
      const token = signToken({
        id: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
        name: safeUser.name,
        clientId: safeUser.clientId,
        clientPortalRole: safeUser.clientPortalRole,
      });

      res.cookie("token", token, getCookieOptions());
    }

    return res.json({
      user: safeUser,
    });
  } catch (error) {
    console.error("ME_ERROR:", error);
    return res.status(500).json({
      message: "Server error while loading session",
    });
  }
}

async function logout(req, res) {
  res.clearCookie("token", getClearCookieOptions());

  return res.json({
    message: "Logged out successfully",
  });
}

async function forgotPassword(req, res) {
  // The response is deliberately identical for known and unknown addresses so
  // this endpoint cannot be used to enumerate accounts.
  const genericResponse = {
    message:
      "If an account exists for that email address, a reset link is on its way.",
  };

  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.json(genericResponse);
    }

    const { url } = await issuePasswordToken(user.id, "reset");

    await sendSupportEmail({
      to: user.email,
      subject: "Reset your APLISIM password",
      text: `Hello ${user.name},

We received a request to reset your APLISIM password.

Open this link to choose a new password (valid for 1 hour):
${url}

If you did not request this, you can safely ignore this email.

Best regards,
APLISIM Support`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <p>Hello ${user.name},</p>
          <p>We received a request to reset your APLISIM password.</p>
          <p><a href="${url}">Choose a new password</a> (link valid for 1 hour).</p>
          <p style="color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
          <p>Best regards,<br />APLISIM Support</p>
        </div>
      `,
    });

    return res.json(genericResponse);
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR:", error);
    return res.json(genericResponse);
  }
}

async function resetPassword(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!token) {
      return res.status(400).json({
        message: "Reset token is required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters long",
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirm password do not match",
      });
    }

    const record = await consumePasswordToken(token);

    if (!record) {
      return res.status(400).json({
        message: "This reset link is invalid or has expired",
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding link for this account is now void.
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: record.userId,
          usedAt: null,
        },
      }),
    ]);

    return res.json({
      message: "Password updated successfully. You can now sign in.",
      email: record.user.email,
    });
  } catch (error) {
    console.error("RESET_PASSWORD_ERROR:", error);
    return res.status(500).json({
      message: "Server error while resetting password",
    });
  }
}

module.exports = {
  login,
  me,
  logout,
  forgotPassword,
  resetPassword,
};