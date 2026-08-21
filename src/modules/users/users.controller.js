const prisma = require("../../config/prisma");
const { hashPassword } = require("../../utils/passwords");

const INTERNAL_ROLES = ["admin", "staff", "viewer"];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function countOtherAdmins(excludedUserId) {
  return prisma.user.count({
    where: {
      role: "admin",
      id: { not: excludedUserId },
    },
  });
}

async function getUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: INTERNAL_ROLES } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    return res.json(users.map(serializeUser));
  } catch (error) {
    console.error("GET_USERS_ERROR:", error);
    return res.status(500).json({
      message: "Server error while loading users",
    });
  }
}

async function createUser(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "staff").trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    if (!INTERNAL_ROLES.includes(role)) {
      return res.status(400).json({
        message: "Role must be one of admin, staff or viewer",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role,
      },
    });

    return res.status(201).json(serializeUser(created));
  } catch (error) {
    console.error("CREATE_USER_ERROR:", error);
    return res.status(500).json({
      message: "Server error while creating user",
    });
  }
}

async function updateUser(req, res) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      return res.status(404).json({ message: "User not found" });
    }

    const payload = req.body || {};

    const nextName =
      payload.name === undefined ? user.name : String(payload.name || "").trim();

    const nextEmail =
      payload.email === undefined
        ? user.email
        : String(payload.email || "")
            .trim()
            .toLowerCase();

    const nextRole =
      payload.role === undefined ? user.role : String(payload.role || "").trim();

    if (!nextName) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!emailRegex.test(nextEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    if (!INTERNAL_ROLES.includes(nextRole)) {
      return res.status(400).json({
        message: "Role must be one of admin, staff or viewer",
      });
    }

    // Changing your own role is how an admin accidentally locks themselves out.
    if (user.id === req.user.id && nextRole !== user.role) {
      return res.status(400).json({
        message: "You cannot change your own role",
      });
    }

    if (user.role === "admin" && nextRole !== "admin") {
      const remainingAdmins = await countOtherAdmins(user.id);

      if (remainingAdmins === 0) {
        return res.status(400).json({
          message: "At least one admin account must remain",
        });
      }
    }

    if (nextEmail !== user.email) {
      const existing = await prisma.user.findUnique({
        where: { email: nextEmail },
      });

      if (existing && existing.id !== user.id) {
        return res.status(409).json({
          message: "Another user already uses this email address",
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: nextName,
        email: nextEmail,
        role: nextRole,
      },
    });

    return res.json(serializeUser(updated));
  } catch (error) {
    console.error("UPDATE_USER_ERROR:", error);
    return res.status(500).json({
      message: "Server error while updating user",
    });
  }
}

async function resetUserPassword(req, res) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      return res.status(404).json({ message: "User not found" });
    }

    const newPassword = String(req.body?.newPassword || "");

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters long",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    return res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("RESET_USER_PASSWORD_ERROR:", error);
    return res.status(500).json({
      message: "Server error while resetting password",
    });
  }
}

async function deleteUser(req, res) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        message: "You cannot delete your own account",
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      const remainingAdmins = await countOtherAdmins(user.id);

      if (remainingAdmins === 0) {
        return res.status(400).json({
          message: "At least one admin account must remain",
        });
      }
    }

    await prisma.user.delete({ where: { id: user.id } });

    return res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("DELETE_USER_ERROR:", error);
    return res.status(500).json({
      message: "Server error while deleting user",
    });
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
};
