const express = require("express");
const router = express.Router();

const { requireAuth, requireAdmin } = require("../../middleware/auth");
const {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
} = require("./users.controller");

router.get("/", requireAuth, requireAdmin, getUsers);
router.post("/", requireAuth, requireAdmin, createUser);
router.patch("/:id", requireAuth, requireAdmin, updateUser);
router.patch("/:id/password", requireAuth, requireAdmin, resetUserPassword);
router.delete("/:id", requireAuth, requireAdmin, deleteUser);

module.exports = router;
