import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['system', 'queue', 'sms', 'leave'],
      default: 'system',
    },
    role: {
      type: String,
      enum: ['all', 'admin', 'doctor', 'receptionist', 'patient'],
      default: 'all',
    },
    readBy: [
      {
        type: String, // String representation of user ID (or patient ID) who read it
      }
    ],
  },
  {
    timestamps: true,
  }
);

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
