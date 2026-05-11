const express = require("express");
const router = express.Router({ mergeParams: true });

const { requireAuth, requireRole } = require("../../middleware/auth");
const {
  createClientContact,
  updateClientContact,
  deleteClientContact,
} = require("./clientContacts.controller");

router.post(
  "/",
  requireAuth,
  requireRole("admin", "staff"),
  createClientContact
);

router.patch(
  "/:contactId",
  requireAuth,
  requireRole("admin", "staff"),
  updateClientContact
);

router.delete(
  "/:contactId",
  requireAuth,
  requireRole("admin"),
  deleteClientContact
);

module.exports = router;