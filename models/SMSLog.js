import mongoose from 'mongoose';

const smsLogSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
    type: {
      type: String,
      enum: ['issue', 'alert', 'manual', 'otp'],
      default: 'manual',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const SMSLog = mongoose.model('SMSLog', smsLogSchema);
export default SMSLog;
