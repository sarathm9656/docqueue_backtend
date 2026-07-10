import express from 'express';
import {
  getStaffList,
  addStaff,
  editStaff,
  toggleStaffStatus,
  deleteStaff,
  resendCredentials,
  getStaffProfile,
  updateStaffSchedule,
} from '../../controllers/admin/roleController.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Admin-only routes
router.get('/',                              getStaffList);
router.post('/',                             adminOnly, addStaff);
router.put('/:id',                           adminOnly, editStaff);
router.patch('/:id/status',                  adminOnly, toggleStaffStatus);
router.delete('/:id',                        adminOnly, deleteStaff);
router.post('/:id/resend-credentials',       adminOnly, resendCredentials);
router.get('/:id/profile',                   adminOnly, getStaffProfile);

// Admin OR self: schedule update
router.put('/:id/schedule', updateStaffSchedule);

export default router;
