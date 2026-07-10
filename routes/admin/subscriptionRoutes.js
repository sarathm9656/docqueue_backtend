import express from 'express';
import {
  getSubscription,
  upgradeSubscription,
  toggleAutoRenew,
  cancelSubscription,
  simulateExpire,
} from '../../controllers/admin/subscriptionController.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getSubscription);
router.post('/upgrade', adminOnly, upgradeSubscription);
router.patch('/autorenew', adminOnly, toggleAutoRenew);
router.post('/cancel', adminOnly, cancelSubscription);
router.post('/simulate-expire', adminOnly, simulateExpire);

export default router;
