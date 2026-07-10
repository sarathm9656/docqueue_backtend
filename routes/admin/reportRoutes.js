import express from 'express';
import { getDashboardSummary, getAnalytics } from '../../controllers/admin/reportController.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/dashboard-summary', getDashboardSummary);
router.get('/analytics', protect, adminOnly, getAnalytics);

export default router;
