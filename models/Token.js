import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema(
  {
    tokenNumber: {
      type: String,
      required: true,
    },
    sequence: {
      type: Number,
      required: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    patientPhone: {
      type: String,
      trim: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'serving', 'completed', 'skipped'],
      default: 'waiting',
    },
    date: {
      type: String, // format YYYY-MM-DD
      required: true,
      index: true,
    },
    checkInTime: {
      type: Date,
      default: Date.now,
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    skipReason: {
      type: String,
      trim: true,
    },
    consultationFee: {
      type: Number,
      default: 200, // default fee if doctor is configured
    },
    reQueued: {
      type: Boolean,
      default: false,
    },
    isPriority: {
      type: Boolean,
      default: false,
    },
    priorityReason: {
      type: String,
      trim: true,
    },
    doctorNotes: {
      type: String,
      trim: true,
    },
    prescription: {
      medicines: [
        {
          name: { type: String, required: true },
          type: { type: String, default: 'Tablet' },
          dosage: { type: String, default: '' },
          frequency: { type: String, default: '' },
          duration: { type: String, default: '' },
          instructions: { type: String, default: '' },
        }
      ],
      advice: { type: String, default: '' },
      nextVisit: { type: Date }
    }
  },
  {
    timestamps: true,
  }
);

const Token = mongoose.model('Token', tokenSchema);
export default Token;
