import express from 'express';
import { getAllLeaves, createLeave, deleteLeave, updateLeaveStatus, getMyLeaves } from '../../controllers/shared/leaveController.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// All leave endpoints require authentication
router.use(protect);

router.get('/my', getMyLeaves);          // Staff: own leaves only
router.get('/', getAllLeaves);
router.post('/', createLeave);
router.delete('/:id', deleteLeave);
router.patch('/:id/status', updateLeaveStatus);

export default router;
