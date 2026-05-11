const bcrypt = require("bcryptjs");

async function hashPassword(password) {
  if (!password || String(password).length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  return bcrypt.hash(String(password), 10);
}

async function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(String(password), hash);
}

module.exports = {
  hashPassword,
  comparePassword,
};