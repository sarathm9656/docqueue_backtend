import express from 'express';
import {
  getClinic,
  updateClinic,
  toggleHolidayMode,
} from '../../controllers/admin/clinicController.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getClinic);
router.put('/', protect, adminOnly, updateClinic);
router.post('/holiday', protect, adminOnly, toggleHolidayMode);

export default router;
