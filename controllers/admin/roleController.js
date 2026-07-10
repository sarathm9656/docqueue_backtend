import Staff from '../../models/Staff.js';
import Token from '../../models/Token.js';
import Subscription from '../../models/Subscription.js';
import bcrypt from 'bcryptjs';
import sendEmail from '../../utils/mail.js';


// Helper to get active subscription limits
const getMaxDoctorsLimit = async () => {
  const sub = await Subscription.findOne({ status: 'active' });
  if (!sub) return 2; // Basic plan default
  return sub.maxDoctors;
};

// @desc    Get all staff members
// @route   GET /api/staff
// @access  Private (Admin only)
export const getStaffList = async (req, res) => {
  try {
    const staff = await Staff.find().select('-password').sort({ createdAt: -1 });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add Doctor or Receptionist
// @route   POST /api/staff
// @access  Private (Admin only)
export const addStaff = async (req, res) => {
  const { name, email, phone, role, specializations, permissions, registrationNumber, signature } = req.body;

  try {
    // 1. Check if email already exists
    const emailExists = await Staff.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ message: 'Staff member with this email already exists.' });
    }

    // 2. If Doctor, check subscription limits
    if (role === 'doctor') {
      const activeDoctors = await Staff.countDocuments({ role: 'doctor' });
      const maxLimit = await getMaxDoctorsLimit();
      if (activeDoctors >= maxLimit) {
        return res.status(403).json({
          message: `Doctor limit reached for your subscription plan (${maxLimit} doctors max). Upgrade your plan to add more.`,
        });
      }
    }

    // 3. Generate credentials
    const generatedPassword = Math.random().toString(36).slice(-8); // random 8-char password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(generatedPassword, salt);

    const staff = await Staff.create({
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      specializations: role === 'doctor' ? specializations || [] : undefined,
      permissions: permissions || (role === 'doctor' ? ['queue'] : ['queue', 'sms']),
      registrationNumber: role === 'doctor' ? registrationNumber : undefined,
      signature: role === 'doctor' ? signature : undefined,
    });

    // Send email with credentials
    let emailSent = true;
    console.log(`\n[DEVELOPMENT] Generated Credentials for ${name}:`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${generatedPassword}\n`);
    try {
      await sendEmail({
        to: email,
        subject: 'Clinic Queue System - Account Details',
        text: `Hello ${name},\n\nYour account has been created on the Clinic Queue System.\n\nRole: ${role.toUpperCase()}\nLogin Email: ${email}\nPassword: ${generatedPassword}\n\nPlease login using these credentials and change your password on your first login.\n\nBest regards,\nClinic Queue System`,
        html: `
          <h3>Welcome to Clinic Queue System</h3>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your account has been created on the Clinic Queue System with the following details:</p>
          <ul>
            <li><strong>Role:</strong> ${role.toUpperCase()}</li>
            <li><strong>Login Email:</strong> ${email}</li>
            <li><strong>Password:</strong> ${generatedPassword}</li>
          </ul>
          <p>Please login using these credentials and change your password on your first login.</p>
          <br/>
          <p>Best regards,<br/>Clinic Queue System</p>
        `
      });
    } catch (mailError) {
      console.error(`Failed to send email to ${email}:`, mailError.message);
      emailSent = false;
    }

    res.status(201).json({
      _id: staff._id,
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      specializations: staff.specializations,
      permissions: staff.permissions,
      registrationNumber: staff.registrationNumber,
      signature: staff.signature,
      isActive: staff.isActive,
      message: emailSent 
        ? 'Staff added successfully. Credentials sent to email.'
        : 'Staff added successfully, but credentials email could not be sent. Please check email configurations.',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Edit staff details
// @route   PUT /api/staff/:id
// @access  Private (Admin only)
export const editStaff = async (req, res) => {
  const { name, email, phone, specializations, permissions, registrationNumber, signature } = req.body;

  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    // Check email uniqueness if email is changed
    if (email && email !== staff.email) {
      const emailExists = await Staff.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'This email is already in use.' });
      }
      staff.email = email;
    }

    if (name) staff.name = name;
    if (phone) staff.phone = phone;
    if (specializations && staff.role === 'doctor') {
      staff.specializations = specializations;
    }
    if (permissions) {
      staff.permissions = permissions;
    }
    if (staff.role === 'doctor') {
      if (registrationNumber !== undefined) staff.registrationNumber = registrationNumber;
      if (signature !== undefined) staff.signature = signature;
    }

    const updatedStaff = await staff.save();
    res.json({
      _id: updatedStaff._id,
      name: updatedStaff.name,
      email: updatedStaff.email,
      phone: updatedStaff.phone,
      role: updatedStaff.role,
      specializations: updatedStaff.specializations,
      permissions: updatedStaff.permissions,
      registrationNumber: updatedStaff.registrationNumber,
      signature: updatedStaff.signature,
      isActive: updatedStaff.isActive,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle Enable/Disable staff account
// @route   PATCH /api/staff/:id/status
// @access  Private (Admin only)
export const toggleStaffStatus = async (req, res) => {
  const { isActive } = req.body;

  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    staff.isActive = isActive;
    await staff.save();

    res.json({
      _id: staff._id,
      name: staff.name,
      role: staff.role,
      isActive: staff.isActive,
      message: `Staff account successfully ${isActive ? 'enabled' : 'disabled'}.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete staff account
// @route   DELETE /api/staff/:id
// @access  Private (Admin only)
export const deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    // Check if doctor has active queue sessions (tokens today with status 'waiting' or 'serving')
    const todayStr = new Date().toISOString().split('T')[0];
    const activeTokens = await Token.countDocuments({
      doctor: staff._id,
      date: todayStr,
      status: { $in: ['waiting', 'serving'] },
    });

    if (activeTokens > 0) {
      return res.status(400).json({
        message: 'Cannot delete doctor with active queue sessions. Please transfer or complete their active tokens first.',
      });
    }

    await Staff.findByIdAndDelete(req.params.id);
    res.json({ message: 'Staff member deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Resend Credentials
// @route   POST /api/staff/:id/resend-credentials
// @access  Private (Admin only)
export const resendCredentials = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    // Generate new credentials
    const newPassword = Math.random().toString(36).slice(-8);
    const salt = await bcrypt.genSalt(10);
    staff.password = await bcrypt.hash(newPassword, salt);
    await staff.save();

    // Send new credentials email
    let emailSent = true;
    console.log(`\n[DEVELOPMENT] Reset Credentials for ${staff.name}:`);
    console.log(`Email: ${staff.email}`);
    console.log(`New Password: ${newPassword}\n`);
    try {
      await sendEmail({
        to: staff.email,
        subject: 'Clinic Queue System - Credentials Reset',
        text: `Hello ${staff.name},\n\nYour login credentials have been reset.\n\nRole: ${staff.role.toUpperCase()}\nLogin Email: ${staff.email}\nNew Password: ${newPassword}\n\nPlease login using these new credentials.\n\nBest regards,\nClinic Queue System`,
        html: `
          <h3>Clinic Queue System - Credentials Reset</h3>
          <p>Hello <strong>${staff.name}</strong>,</p>
          <p>Your login credentials have been reset. Here are your new details:</p>
          <ul>
            <li><strong>Role:</strong> ${staff.role.toUpperCase()}</li>
            <li><strong>Login Email:</strong> ${staff.email}</li>
            <li><strong>New Password:</strong> ${newPassword}</li>
          </ul>
          <p>Please login using these new credentials.</p>
          <br/>
          <p>Best regards,<br/>Clinic Queue System</p>
        `
      });
    } catch (mailError) {
      console.error(`Failed to send email to ${staff.email}:`, mailError.message);
      emailSent = false;
    }

    res.json({ 
      message: emailSent 
        ? `New credentials resent to ${staff.name}'s email.`
        : `Credentials updated, but email could not be sent to ${staff.name}. Please check email configurations.`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single staff profile (admin view)
// @route   GET /api/staff/:id/profile
// @access  Private (Admin)
export const getStaffProfile = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id).select('-password -otp -sessionVersion');
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update staff schedule — admin OR staff self
// @route   PUT /api/staff/:id/schedule
// @access  Private (Admin or self)
export const updateStaffSchedule = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    // Allow admin OR the staff member themselves
    const isSelf  = req.user._id.toString() === staff._id.toString();
    const isAdmin = req.role === 'admin';

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Not authorised to update this schedule.' });
    }

    const { workingDays, shiftStart, shiftEnd, breakStart, breakEnd, maxDailyPatients } = req.body;

    const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    staff.schedule = {
      workingDays:      Array.isArray(workingDays) ? workingDays.filter(d => VALID_DAYS.includes(d)) : staff.schedule?.workingDays || [],
      shiftStart:       shiftStart       ?? staff.schedule?.shiftStart ?? '09:00',
      shiftEnd:         shiftEnd         ?? staff.schedule?.shiftEnd   ?? '17:00',
      breakStart:       breakStart       ?? staff.schedule?.breakStart ?? '',
      breakEnd:         breakEnd         ?? staff.schedule?.breakEnd   ?? '',
      maxDailyPatients: maxDailyPatients !== undefined ? Number(maxDailyPatients) : (staff.schedule?.maxDailyPatients ?? 0),
    };

    await staff.save();

    res.json({ message: 'Schedule updated successfully.', schedule: staff.schedule });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
