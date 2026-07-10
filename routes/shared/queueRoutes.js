import express from 'express';
import {
  getLiveQueue,
  toggleDoctorAvailability,
  addToken,
  updateTokenStatus,
  reQueueToken,
  transferToken,
  resetQueue,
  callPatient,
  emergencyCallPatient,
  sendManualSMS,
  getSMSLogs,
  bulkBlockTokens,
  endDoctorSession,
  getDoctorStats,
  reorderTokens,
  updateDoctorPacing,
  getPublicClinicInfo,
  registerPublicTokens,
  getPatientTokens,
  cancelPatientToken,
  sendPatientOTP,
  verifyPatientOTP,
  getPatientHistory,
  updatePatientProfile,
  getPatientHistoryForDoctor,
} from '../../controllers/shared/queueController.js';
import { protect, adminOnly, patientProtect } from '../../middleware/auth.js';

const router = express.Router();

// Public patient endpoints
router.get('/public/clinic', getPublicClinicInfo);
router.post('/public/auth/send-otp', sendPatientOTP);
router.post('/public/auth/verify-otp', verifyPatientOTP);
router.get('/live', getLiveQueue);

// Protected patient endpoints (require OTP login)
router.post('/public/register', patientProtect, registerPublicTokens);
router.get('/public/tokens', patientProtect, getPatientTokens);
router.post('/public/cancel-token', patientProtect, cancelPatientToken);
router.get('/public/history', patientProtect, getPatientHistory);
router.put('/public/profile', patientProtect, updatePatientProfile);

router.use(protect);

router.patch('/availability/:doctorId', toggleDoctorAvailability);
router.post('/add', addToken);
router.patch('/token/:tokenId', updateTokenStatus);
router.post('/token/:tokenId/requeue', reQueueToken);
router.post('/token/:tokenId/transfer', adminOnly, transferToken);
router.post('/reset', adminOnly, resetQueue);
router.post('/token/:tokenId/call', callPatient);
router.post('/token/:tokenId/emergency-call', emergencyCallPatient);
router.post('/token/:tokenId/sms', sendManualSMS);
router.get('/sms-logs', getSMSLogs);
router.post('/bulk-block', adminOnly, bulkBlockTokens);
router.post('/doctor/:doctorId/end-session', endDoctorSession);
router.get('/doctor/:doctorId/stats', getDoctorStats);
router.post('/reorder', reorderTokens);
router.patch('/doctor/:doctorId/pacing', updateDoctorPacing);
router.get('/patient/:phone/history', getPatientHistoryForDoctor);

export default router;
