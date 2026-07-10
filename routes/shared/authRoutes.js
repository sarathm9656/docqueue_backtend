import express from 'express';
import {
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
} from '../../controllers/shared/authController.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/change-password', protect, changePassword);
router.get('/me', protect, getMe);

export default router;
