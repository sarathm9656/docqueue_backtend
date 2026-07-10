import express from 'express';
import { getMedicines, addMedicine } from '../../controllers/shared/medicineController.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

router.route('/')
  .get(protect, getMedicines)
  .post(protect, addMedicine);

export default router;
