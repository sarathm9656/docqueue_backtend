import express from 'express';
import { getNotifications, markAllNotificationsRead } from '../../controllers/shared/notificationController.js';
import { anyUserProtect } from '../../middleware/auth.js';

const router = express.Router();

router.get('/', anyUserProtect, getNotifications);
router.post('/read', anyUserProtect, markAllNotificationsRead);

export default router;
