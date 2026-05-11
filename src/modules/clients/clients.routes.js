const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../../middleware/auth");
const {
  getClients,
  getClientsCount,
  getClientById,
  createClient,
  updateClient,
  createClientPortalUser,
  updateClientPortalUserRole,
  deleteClient,
} = require("./clients.controller");
const clientContactsRoutes = require("./clientContacts.routes");

router.use("/:clientId/contacts", requireAuth, clientContactsRoutes);

router.get(
  "/count",
  requireAuth,
  requireRole("admin", "staff", "viewer"),
  getClientsCount
);

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "staff", "viewer", "client"),
  getClientById
);

router.get(
  "/",
  requireAuth,
  requireRole("admin", "staff", "viewer"),
  getClients
);

router.post(
  "/",
  requireAuth,
  requireRole("admin", "staff"),
  createClient
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "staff"),
  updateClient
);

router.patch(
  "/:id/portal-users/:userId/role",
  requireAuth,
  requireRole("admin"),
  updateClientPortalUserRole
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  deleteClient
);

router.post(
  "/:id/portal-users",
  requireAuth,
  requireRole("admin"),
  createClientPortalUser
);

module.exports = router;