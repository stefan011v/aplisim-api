const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../../middleware/auth");
const { requireInboundEmailSecret } = require("../../middleware/inboundEmailAuth");
const {
  getTickets,
  getTicketById,
  getTicketsCount,
  createTicket,
  updateTicket,
  createTicketMessage,
  createTicketAttachment,
  downloadTicketAttachment,
  deleteTicket,
  deleteTicketAttachment,
  sendTicketReplyEmail,
  handleInboundEmail,
} = require("./tickets.controller");
const { uploadTicketAttachment } = require("./tickets.upload");

router.post("/inbound/email", requireInboundEmailSecret, handleInboundEmail);

router.get(
  "/count",
  requireAuth,
  requireRole("admin", "staff", "viewer"),
  getTicketsCount
);

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "staff", "viewer", "client"),
  getTicketById
);

router.get(
  "/",
  requireAuth,
  requireRole("admin", "staff", "viewer", "client"),
  getTickets
);

router.post(
  "/",
  requireAuth,
  requireRole("admin", "staff", "client"),
  createTicket
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "staff"),
  updateTicket
);

router.post(
  "/:id/messages",
  requireAuth,
  requireRole("admin", "staff", "client"),
  createTicketMessage
);

router.post(
  "/:id/email-reply",
  requireAuth,
  requireRole("admin", "staff"),
  sendTicketReplyEmail
);

router.post(
  "/:id/attachments",
  requireAuth,
  requireRole("admin", "staff", "client"),
  uploadTicketAttachment.single("file"),
  createTicketAttachment
);

router.get(
  "/:id/attachments/:attachmentId/download",
  requireAuth,
  requireRole("admin", "staff", "viewer", "client"),
  downloadTicketAttachment
);

router.delete(
  "/:id/attachments/:attachmentId",
  requireAuth,
  requireRole("admin", "staff"),
  deleteTicketAttachment
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  deleteTicket
);

module.exports = router;