import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other'],
      default: 'Tablet',
    },
    defaultDosage: {
      type: String,
      trim: true,
      default: '', 
    },
    defaultFrequency: {
      type: String,
      trim: true,
      default: '', 
    },
    defaultDuration: {
      type: String,
      trim: true,
      default: '',
    },
    defaultInstructions: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const Medicine = mongoose.model('Medicine', medicineSchema);
export default Medicine;
