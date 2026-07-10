import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
  invoiceId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true },
  plan: { type: String, required: true },
  status: { type: String, enum: ['paid', 'failed'], default: 'paid' },
});

const subscriptionSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: ['Basic', 'Pro', 'Enterprise'],
      default: 'Basic',
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    maxDoctors: {
      type: Number,
      default: 2, // Basic has 2, Pro has 10, Enterprise has 999
    },
    invoices: [invoiceSchema],
  },
  { timestamps: true }
);

const Subscription = mongoose.model('Subscription', subscriptionSchema);
export default Subscription;
