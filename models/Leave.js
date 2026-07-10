import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    leaveType: {
      type: String,
      enum: ['clinic', 'staff'],
      required: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: function() { return this.leaveType === 'staff'; }
    },
    date: {
      type: String, // format YYYY-MM-DD
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'addedByModel',
      required: true,
    },
    addedByModel: {
      type: String,
      enum: ['Admin', 'Staff'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved', // Default to approved for admin additions
    }
  },
  { timestamps: true }
);

// Prevent duplicate leaves for same staff on same day, or same clinic leave on same day
leaveSchema.index({ leaveType: 1, staffId: 1, date: 1 }, { unique: true });

const Leave = mongoose.model('Leave', leaveSchema);
export default Leave;
