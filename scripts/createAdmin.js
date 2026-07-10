/**
 * Admin Creation Script
 * ─────────────────────
 * Run from the backend directory:
 *   node scripts/createAdmin.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "readline";

// ── Admin Schema (inline to keep script self-contained) ──────────────────────
const adminSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    email:          { type: String, required: true, unique: true, trim: true, lowercase: true },
    password:       { type: String, required: true },
    phone:          { type: String, trim: true },
    isFirstLogin:   { type: Boolean, default: true },
    loginAttempts:  { type: Number, default: 0 },
    lockUntil:      { type: Date },
    lastLogin:      { type: Date },
    sessionVersion: { type: String },
    otp:            { code: { type: String }, expiresAt: { type: Date } },
  },
  { timestamps: true, collection: "clinic_admins" }
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

// ── Readline helper ──────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));

// ── Validation helpers ───────────────────────────────────────────────────────
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isValidPhone = (p) => p === "" || /^[+\d][\d\s\-().]{6,}$/.test(p);

// ── Main ─────────────────────────────────────────────────────────────────────
const run = async () => {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/clinic_queue";

  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║       Clinic Admin Creator Script     ║");
  console.log("╚═══════════════════════════════════════╝\n");

  // 1. Connect to MongoDB
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`✅  Connected to MongoDB: ${mongoose.connection.host}\n`);
  } catch (err) {
    console.error("❌  Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }

  let name, email, phone, password, confirmPassword;

  // Name
  while (true) {
    name = await ask("👤  Admin Name       : ");
    if (name.length >= 2) break;
    console.log("    ⚠  Name must be at least 2 characters.\n");
  }

  // Email
  while (true) {
    email = await ask("📧  Email Address    : ");
    if (isValidEmail(email)) break;
    console.log("    ⚠  Please enter a valid email address.\n");
  }

  // Phone (optional)
  while (true) {
    phone = await ask("📞  Phone (optional) : ");
    if (isValidPhone(phone)) break;
    console.log("    ⚠  Please enter a valid phone number or leave it blank.\n");
  }

  // Password with confirmation
  while (true) {
    password        = await ask("🔒  Password         : ");
    confirmPassword = await ask("🔒  Confirm Password : ");
    if (password.length < 6) {
      console.log("    ⚠  Password must be at least 6 characters.\n");
    } else if (password !== confirmPassword) {
      console.log("    ⚠  Passwords do not match. Try again.\n");
    } else {
      break;
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log("  Review Details:");
  console.log(`  Name  : ${name}`);
  console.log(`  Email : ${email}`);
  console.log(`  Phone : ${phone || "(not provided)"}`);
  console.log("─────────────────────────────────────────\n");

  const confirmRaw = await ask("❓  Create this admin? [Y/n]: ");
  // Empty Enter = default yes; accept y, yes, 1
  const confirm = confirmRaw.trim().toLowerCase();
  const isYes   = confirm === '' || confirm === 'y' || confirm === 'yes' || confirm === '1';

  if (!isYes) {
    console.log(`\n🚫  Aborted (got: "${confirmRaw}"). No admin was created.\n`);
    rl.close();
    await mongoose.disconnect();
    process.exit(0);
  }

  // Check duplicate email
  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`\n❌  An admin with email "${email}" already exists.`);
    console.log("    Use the login page or reset the password instead.\n");
    rl.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  // Hash password and save
  const salt           = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const admin = new Admin({
    name,
    email,
    password: hashedPassword,
    phone: phone || undefined,
    isFirstLogin: true,
  });

  await admin.save();

  console.log("\n✅  Admin created successfully!");
  console.log("─────────────────────────────────────────");
  console.log(`  ID    : ${admin._id}`);
  console.log(`  Name  : ${admin.name}`);
  console.log(`  Email : ${admin.email}`);
  console.log(`  Phone : ${admin.phone || "(not set)"}`);
  console.log("─────────────────────────────────────────");
  console.log("  Login at your clinic dashboard with the above credentials.\n");

  rl.close();
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("\n❌  Unexpected error:", err.message);
  process.exit(1);
});
