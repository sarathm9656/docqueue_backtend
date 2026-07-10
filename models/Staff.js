import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['doctor', 'receptionist'],
      required: true,
    },
    specializations: [
      {
        type: String,
        trim: true,
      },
    ],
    registrationNumber: {
      type: String,
      trim: true,
    },
    signature: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    permissions: {
      type: [String],
      default: ['queue'],
    },
    availabilityStatus: {
      type: String,
      enum: ['active', 'stopped', 'offline'],
      default: 'offline',
    },
    pauseReason: {
      type: String,
      trim: true,
    },
    consultationTimeMinutes: {
      type: Number,
      default: 8,
    },
    isFirstLogin: {
      type: Boolean,
      default: true,
    },
    sessionVersion: {
      type: String,
    },
    lastLogin: {
      type: Date,
    },
    schedule: {
      workingDays: {
        type: [String],
        enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      },
      shiftStart: { type: String, default: '09:00' },
      shiftEnd:   { type: String, default: '17:00' },
      breakStart: { type: String, default: '' },
      breakEnd:   { type: String, default: '' },
      maxDailyPatients: { type: Number, default: 0 }, // 0 = unlimited
    },
    otp: {
      code:      { type: String },
      expiresAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

// Match password
staffSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Staff = mongoose.model('Staff', staffSchema);
export default Staff;
