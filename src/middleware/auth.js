const { verifyToken } = require("../utils/jwt");

function buildSafeUserFromToken(decoded) {
  return {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
    name: decoded.name,
    clientId: decoded.clientId || null,
    clientPortalRole: decoded.clientPortalRole || null,
  };
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const decoded = verifyToken(token);
    req.user = buildSafeUserFromToken(decoded);

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

function requireRole(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    return next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Forbidden",
    });
  }

  return next();
}

function requireClientPortalAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  if (req.user.role !== "client" || req.user.clientPortalRole !== "admin") {
    return res.status(403).json({
      message: "Forbidden",
    });
  }

  return next();
}

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  requireClientPortalAdmin,
};