const prisma = require("../../config/prisma");
const { comparePassword } = require("../../utils/passwords");
const { signToken } = require("../../utils/jwt");

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

async function me(req, res) {
  return res.json({
    user: serializeUser(req.user),
  });
}

async function logout(req, res) {
  res.clearCookie("token", getClearCookieOptions());

  return res.json({
    message: "Logged out successfully",
  });
}

module.exports = {
  login,
  me,
  logout,
};