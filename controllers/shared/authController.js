import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Admin from '../../models/Admin.js';
import Staff from '../../models/Staff.js';
import Clinic from '../../models/Clinic.js';
import sendEmail from '../../utils/mail.js';


// Helper to generate JWT token (8 hours)
const generateToken = (id, sessionVersion) => {
  return jwt.sign({ id, sessionVersion }, process.env.JWT_SECRET || 'secret123', {
    expiresIn: '8h',
  });
};

// @desc    Auth admin / staff and get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const sessionVersion = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const clinic = await Clinic.findOne() || {};

    // 1. Check if Admin
    let admin = await Admin.findOne({ email });

    if (admin) {
      // Check if locked
      if (admin.lockUntil && admin.lockUntil > Date.now()) {
        const remainingMinutes = Math.ceil((admin.lockUntil - Date.now()) / 60000);
        return res.status(423).json({
          message: `Account is locked due to multiple failed attempts. Try again in ${remainingMinutes} minute(s) or reset password via OTP.`,
        });
      }

      // Match password
      const isMatch = await admin.matchPassword(password);

      if (isMatch) {
        // Record current last login for return, then update to new date
        const currentLastLogin = admin.lastLogin;

        admin.loginAttempts = 0;
        admin.lockUntil = undefined;
        admin.sessionVersion = sessionVersion;
        admin.lastLogin = new Date();
        await admin.save();

        const token = generateToken(admin._id, sessionVersion);

        return res.json({
          _id: admin._id,
          userId: admin._id,
          tenantId: clinic._id || 'default_tenant',
          name: admin.name,
          email: admin.email,
          role: 'admin',
          isFirstLogin: admin.isFirstLogin,
          lastLogin: currentLastLogin,
          token,
        });
      } else {
        // Increment attempts
        admin.loginAttempts += 1;
        if (admin.loginAttempts >= 5) {
          admin.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // lock 15 minutes
          await admin.save();
          return res.status(423).json({
            message: 'Account locked for 15 minutes due to 5 failed attempts.',
          });
        }
        await admin.save();
        return res.status(401).json({
          message: `Invalid email or password. Attempt ${admin.loginAttempts}/5.`,
        });
      }
    }

    // 2. Check if Staff (Doctor / Receptionist)
    let staff = await Staff.findOne({ email });
    if (staff) {
      if (!staff.isActive) {
        return res.status(403).json({ message: 'Your account is disabled. Contact Admin.' });
      }

      const isMatch = await staff.matchPassword(password);
      if (isMatch) {
        const currentLastLogin = staff.lastLogin;
        
        staff.sessionVersion = sessionVersion;
        staff.lastLogin = new Date();
        await staff.save();

        const token = generateToken(staff._id, sessionVersion);

        return res.json({
          _id: staff._id,
          userId: staff._id,
          tenantId: clinic._id || 'default_tenant',
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          role: staff.role,
          specializations: staff.specializations,
          permissions: staff.permissions || [],
          schedule: staff.schedule,
          registrationNumber: staff.registrationNumber,
          signature: staff.signature,
          isFirstLogin: staff.isFirstLogin,
          lastLogin: currentLastLogin,
          token,
        });
      } else {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }
    }

    return res.status(401).json({ message: 'Invalid email or password.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send OTP to email for forgot password (Admin + Staff)
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // Search Admin first, then Staff
    let account = await Admin.findOne({ email });
    let accountType = 'admin';

    if (!account) {
      account = await Staff.findOne({ email });
      accountType = 'staff';
    }

    if (!account) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    account.otp = { code: otpCode, expiresAt: otpExpiry };
    await account.save();

    // Send OTP email
    let emailSent = true;
    try {
      await sendEmail({
        to: email,
        subject: 'Clinic Queue System - Password Reset OTP',
        text: `Hello ${account.name},\n\nYou requested a password reset for your Clinic Queue System account.\n\nYour Password Reset OTP is: ${otpCode}\n\nThis OTP is valid for 10 minutes.\n\nBest regards,\nClinic Queue System`,
        html: `
          <h3>Clinic Queue System - Password Reset</h3>
          <p>Hello <strong>${account.name}</strong>,</p>
          <p>You requested a password reset for your <strong>${accountType === 'admin' ? 'Admin' : account.role.charAt(0).toUpperCase() + account.role.slice(1)}</strong> account.</p>
          <p>Your Password Reset OTP is: <strong style="font-size: 1.4em; letter-spacing: 4px; color: #4f46e5;">${otpCode}</strong></p>
          <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          <br/>
          <p>Best regards,<br/>Clinic Queue System</p>
        `
      });
    } catch (mailError) {
      console.error(`Failed to send email to ${email}:`, mailError.message);
      emailSent = false;
    }

    if (emailSent) {
      res.json({ message: 'OTP sent successfully to your registered email.' });
    } else {
      res.status(500).json({ message: 'Failed to send OTP email. Please check SMTP configuration.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset password using OTP (Admin + Staff)
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    // Search Admin first, then Staff
    let account = await Admin.findOne({ email });

    if (!account) {
      account = await Staff.findOne({ email });
    }

    if (!account) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }

    // Validate OTP
    if (!account.otp || !account.otp.code) {
      return res.status(400).json({ message: 'No OTP was requested for this account. Please use Forgot Password first.' });
    }

    if (account.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP. Please check your email and try again.' });
    }

    if (account.otp.expiresAt < Date.now()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Hash and save new password
    const salt = await bcrypt.genSalt(10);
    account.password     = await bcrypt.hash(newPassword, salt);
    account.isFirstLogin = false;
    account.loginAttempts = 0;
    account.lockUntil    = undefined;
    account.otp          = undefined; // clear OTP after use
    await account.save();

    res.json({ message: 'Password reset successfully. You can now login with your new password.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Force Password change on first login
// @route   POST /api/auth/change-password
// @access  Private
export const changePassword = async (req, res) => {
  const { newPassword } = req.body;

  try {
    // Password complexity check: min 8 chars, 1 number, 1 special character
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }
    const hasNumber = /\d/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
    if (!hasNumber || !hasSpecialChar) {
      return res.status(400).json({ message: 'Password must contain at least 1 number and 1 special character.' });
    }

    if (req.role === 'admin') {
      const admin = await Admin.findById(req.user._id);
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found.' });
      }

      const salt = await bcrypt.genSalt(10);
      admin.password = await bcrypt.hash(newPassword, salt);
      admin.isFirstLogin = false;
      await admin.save();
    } else {
      const staff = await Staff.findById(req.user._id);
      if (!staff) {
        return res.status(404).json({ message: 'Staff member not found.' });
      }

      const salt = await bcrypt.genSalt(10);
      staff.password = await bcrypt.hash(newPassword, salt);
      staff.isFirstLogin = false;
      await staff.save();
    }

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Refresh session / Get current user details
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const clinic = await Clinic.findOne() || {};
    // Generate fresh token with existing sessionVersion to avoid invalidating session
    const token = generateToken(req.user._id, req.user.sessionVersion);

    res.json({
      _id: req.user._id,
      userId: req.user._id,
      tenantId: clinic._id || 'default_tenant',
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.role,
      permissions: req.user.permissions || [],
      specializations: req.user.specializations,
      schedule: req.user.schedule,
      registrationNumber: req.user.registrationNumber,
      signature: req.user.signature,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
