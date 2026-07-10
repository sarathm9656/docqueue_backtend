import Subscription from '../../models/Subscription.js';

// Helper to get or create subscription
const getOrCreateSubscription = async () => {
  let sub = await Subscription.findOne();
  if (!sub) {
    sub = await Subscription.create({
      plan: 'Basic',
      status: 'active',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      autoRenew: true,
      maxDoctors: 2,
      invoices: [
        {
          invoiceId: 'INV-' + Math.floor(100000 + Math.random() * 900000),
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          amount: 0,
          plan: 'Basic',
          status: 'paid',
        },
      ],
    });
  }
  return sub;
};

// @desc    Get active subscription settings
// @route   GET /api/subscription
// @access  Private (Admin / Staff)
export const getSubscription = async (req, res) => {
  try {
    const sub = await getOrCreateSubscription();
    res.json(sub);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Upgrade subscription plan (Simulates Razorpay success callback)
// @route   POST /api/subscription/upgrade
// @access  Private (Admin only)
export const upgradeSubscription = async (req, res) => {
  const { plan } = req.body; // 'Pro' or 'Enterprise'

  if (!['Pro', 'Enterprise'].includes(plan)) {
    return res.status(400).json({ message: 'Invalid plan type for upgrade.' });
  }

  try {
    const sub = await getOrCreateSubscription();

    let amount = 1999; // Pro
    let maxDoc = 10;
    if (plan === 'Enterprise') {
      amount = 4999;
      maxDoc = 999;
    }

    sub.plan = plan;
    sub.status = 'active';
    sub.maxDoctors = maxDoc;
    sub.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // extends 30 days
    sub.autoRenew = true;

    // Add invoice record
    sub.invoices.push({
      invoiceId: 'INV-' + Math.floor(100000 + Math.random() * 900000),
      date: new Date(),
      amount: amount,
      plan: plan,
      status: 'paid',
    });

    await sub.save();
    res.json({ message: `Successfully upgraded to ${plan} plan!`, subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle auto renewal
// @route   PATCH /api/subscription/autorenew
// @access  Private (Admin only)
export const toggleAutoRenew = async (req, res) => {
  try {
    const sub = await getOrCreateSubscription();
    sub.autoRenew = !sub.autoRenew;
    await sub.save();
    res.json(sub);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Cancel subscription (active until expiry)
// @route   POST /api/subscription/cancel
// @access  Private (Admin only)
export const cancelSubscription = async (req, res) => {
  try {
    const sub = await getOrCreateSubscription();
    sub.status = 'cancelled';
    sub.autoRenew = false;
    await sub.save();
    res.json({ message: 'Subscription set to cancel on next billing date.', subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Simulate expiration / lock-out (testing only)
// @route   POST /api/subscription/simulate-expire
// @access  Private (Admin only)
export const simulateExpire = async (req, res) => {
  try {
    const sub = await getOrCreateSubscription();
    sub.status = 'expired';
    sub.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    await sub.save();
    res.json({ message: 'Subscription expired simulation applied.', subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
