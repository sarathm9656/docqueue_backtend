import Token from '../../models/Token.js';
import Staff from '../../models/Staff.js';
import Clinic from '../../models/Clinic.js';
import SMSLog from '../../models/SMSLog.js';
import Patient from '../../models/Patient.js';
import Leave from '../../models/Leave.js';
import jwt from 'jsonwebtoken';
import { triggerNotification } from './notificationController.js';

// Helper to get today's date string in YYYY-MM-DD
const getTodayStr = () => {
  return new Date().toISOString().split('T')[0];
};

const emitQueueUpdate = async (io, text = 'Live Queue state updated by staff member.', type = 'queue', role = 'all') => {
  if (io) {
    io.emit('queueUpdate');
    await triggerNotification(text, type, role, io);
  }
};

// Helper to trigger SMS alerts for patients who are N positions ahead
const checkAndSendSMSAlerts = async (doctorId, io) => {
  try {
    const today = getTodayStr();
    const clinic = await Clinic.findOne();
    const n = clinic ? clinic.smsAlertPositionsAhead : 2;

    // Get all waiting tokens today for this doctor, sorted by sequence
    const waitingTokens = await Token.find({
      doctor: doctorId,
      date: today,
      status: 'waiting',
    }).sort({ sequence: 1 });

    // The patient at index (n - 1) has exactly (n - 1) patients ahead of them
    // (e.g. index 1 is the 2nd waiting patient. There is 1 patient ahead of them, plus the currently serving one if any).
    // Let's alert the patient at index (n - 1) if they exist.
    if (waitingTokens.length >= n) {
      const targetToken = waitingTokens[n - 1];
      const doctor = await Staff.findById(doctorId);
      
      const smsMessage = `Dear ${targetToken.patientName}, you are next in line! Only ${n} position(s) ahead of you in Dr. ${doctor ? doctor.name : ''}'s queue. Token: ${targetToken.tokenNumber}. Please be ready.`;
      
      console.log(`\n--- [SMS ALERT SENT] ---`);
      console.log(`To: ${targetToken.patientPhone || 'N/A'}`);
      console.log(`Message: ${smsMessage}`);
      console.log(`-------------------------\n`);
      
      // Log to database
      await SMSLog.create({
        patientName: targetToken.patientName,
        phone: targetToken.patientPhone || 'N/A',
        message: smsMessage,
        status: 'sent',
        type: 'alert',
      });

      if (io) {
        io.emit('patientAlert', {
          tokenNumber: targetToken.tokenNumber,
          patientName: targetToken.patientName,
          positionsAhead: n,
        });
        await triggerNotification(
          `SMS patient alert sent: Token ${targetToken.tokenNumber} (${targetToken.patientName}) is next.`,
          'sms',
          'all',
          io
        );
      }
    }
  } catch (error) {
    console.error('Error sending SMS alerts:', error.message);
  }
};

// @desc    Get live queue data for all doctors
// @route   GET /api/queue/live
// @access  Private (Admin / Staff)
export const getLiveQueue = async (req, res) => {
  try {
    const today = getTodayStr();
    
    // Find all doctors
    const doctors = await Staff.find({ role: 'doctor' }).select('-password');
    const clinic = await Clinic.findOne() || {};

    const queueData = await Promise.all(
      doctors.map(async (doc) => {
        // Fetch all tokens today for this doctor
        const tokens = await Token.find({
          doctor: doc._id,
          date: today,
        }).sort({ sequence: 1 });

        return {
          doctor: doc,
          tokens: tokens,
        };
      })
    );

    res.json({
      holidayMode: clinic.holidayMode || { isActive: false, message: '' },
      queues: queueData,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle pause / resume for a doctor's availability
// @route   PATCH /api/queue/availability/:doctorId
// @access  Private (Admin / Doctor)
export const toggleDoctorAvailability = async (req, res) => {
  const { status, pauseReason } = req.body; // 'active', 'stopped', 'offline'
  
  try {
    const doctor = await Staff.findById(req.params.doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const oldStatus = doctor.availabilityStatus;
    doctor.availabilityStatus = status;

    if (status === 'stopped') {
      doctor.pauseReason = pauseReason || 'Break';
    } else {
      doctor.pauseReason = undefined;
    }

    await doctor.save();

    const io = req.app.get('socketio');

    // Resume queue SMS notification to next waiting patient
    if (status === 'active' && oldStatus === 'stopped') {
      const today = getTodayStr();
      const nextToken = await Token.findOne({
        doctor: doctor._id,
        date: today,
        status: 'waiting'
      }).sort({ sequence: 1 });

      if (nextToken && nextToken.patientPhone) {
        const smsMessage = `Dear ${nextToken.patientName}, Dr. ${doctor.name}'s queue has resumed. Please be ready. Your token is ${nextToken.tokenNumber}.`;
        console.log(`\n--- [SMS SENT ON RESUME] ---`);
        console.log(`To: ${nextToken.patientPhone}`);
        console.log(`Message: ${smsMessage}`);
        console.log(`-----------------------------\n`);
        
        await SMSLog.create({
          patientName: nextToken.patientName,
          phone: nextToken.patientPhone,
          message: smsMessage,
          status: 'sent',
          type: 'alert'
        });

        if (io) {
          io.emit('patientAlert', {
            tokenNumber: nextToken.tokenNumber,
            patientName: nextToken.patientName,
            positionsAhead: 1
          });
          await triggerNotification(
            `SMS patient alert sent: Token ${nextToken.tokenNumber} (${nextToken.patientName}) is next.`,
            'sms',
            'all',
            io
          );
        }
      }
    }

    await emitQueueUpdate(io, `Doctor status updated to ${status}.`);

    res.json({ message: `Doctor status updated to ${status}.`, doctor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manually add token (Emergency / VIP)
// @route   POST /api/queue/add
// @access  Private (Admin / Receptionist)
export const addToken = async (req, res) => {
  const { patientName, patientPhone, doctorId, isPriority, priorityReason, overrideDuplicate } = req.body;

  try {
    const today = getTodayStr();
    
    // Check if clinic is in holiday mode or has an approved leave today
    const clinic = await Clinic.findOne();
    if (clinic && clinic.holidayMode.isActive) {
      return res.status(400).json({ message: 'Clinic queue is closed today due to holiday mode.' });
    }

    const clinicLeave = await Leave.findOne({ leaveType: 'clinic', date: today, status: 'approved' });
    if (clinicLeave) {
      return res.status(400).json({ message: `Clinic is closed today (Approved Holiday: ${clinicLeave.reason || 'Leave'}).` });
    }

    const doctor = await Staff.findById(doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    // Check if doctor is on approved leave today
    const doctorLeave = await Leave.findOne({ leaveType: 'staff', staffId: doctorId, date: today, status: 'approved' });
    if (doctorLeave) {
      return res.status(400).json({ message: `Dr. ${doctor.name} is on approved leave today.` });
    }

    // Phone number duplicate validation
    if (patientPhone && overrideDuplicate !== true) {
      const activeTokenExists = await Token.findOne({
        patientPhone,
        date: today,
        status: { $in: ['waiting', 'serving'] }
      });
      if (activeTokenExists) {
        return res.status(409).json({
          duplicateWarning: true,
          message: `Patient with phone ${patientPhone} already has an active token today (${activeTokenExists.tokenNumber}). Do you wish to override?`
        });
      }
    }

    // Get configuration
    const prefix = clinic ? clinic.queueConfig.tokenPrefix : 'TK';
    const startNum = clinic ? clinic.queueConfig.tokenStartNumber : 1;
    const maxTokens = clinic ? clinic.queueConfig.maxTokensPerDoctor : 50;

    // Count today's tokens for this doctor
    const tokenCount = await Token.countDocuments({ doctor: doctorId, date: today });
    if (tokenCount >= maxTokens) {
      return res.status(400).json({ message: `Daily token limit of ${maxTokens} reached for Dr. ${doctor.name}.` });
    }

    let sequence = 1;
    const lastToken = await Token.findOne({ doctor: doctorId, date: today }).sort({ sequence: -1 });
    const standardNextSeq = lastToken ? lastToken.sequence + 1 : 1;

    if (isPriority) {
      // Priority math: place directly after currently serving token (or 1 if none serving)
      const servingToken = await Token.findOne({ doctor: doctorId, date: today, status: 'serving' });
      const targetSeq = servingToken ? servingToken.sequence + 1 : 1;

      // Shift subsequent waiting tokens
      await Token.updateMany(
        { doctor: doctorId, date: today, sequence: { $gte: targetSeq }, status: 'waiting' },
        { $inc: { sequence: 1 } }
      );
      sequence = targetSeq;
    } else {
      sequence = standardNextSeq;
    }

    // Generate token number based on total created tokens today to ensure uniqueness
    const todayTokensCount = await Token.countDocuments({ doctor: doctorId, date: today });
    const tokenNumberNum = startNum + todayTokensCount;
    const tokenNumber = `${prefix}${tokenNumberNum.toString().padStart(3, '0')}`;

    // If doctor is offline, mark them as 'active' now that tokens are incoming
    if (doctor.availabilityStatus === 'offline') {
      doctor.availabilityStatus = 'active';
      await doctor.save();
    }

    const newToken = await Token.create({
      tokenNumber,
      sequence,
      patientName,
      patientPhone,
      doctor: doctorId,
      status: 'waiting',
      date: today,
      consultationFee: 200, // default fee
      isPriority: !!isPriority,
      priorityReason: isPriority ? priorityReason : undefined,
    });

    // Calculate estimated wait time: (tokensAhead) * (avg consultation time)
    const tokensAheadCount = await Token.countDocuments({
      doctor: doctorId,
      date: today,
      status: 'waiting',
      sequence: { $lt: sequence }
    });
    const hasServing = await Token.countDocuments({ doctor: doctorId, date: today, status: 'serving' });
    const totalAhead = tokensAheadCount + hasServing;
    const avgConsultTime = clinic ? clinic.consultationTimeMinutes : 8;
    const estWaitTime = totalAhead * avgConsultTime;

    // Send SMS on token issue
    const smsMessage = `Your token is ${tokenNumber} at ${clinic ? clinic.name : 'Jenkins Clinic'}. Dr. ${doctor.name}. Est. wait: ${estWaitTime} min.`;
    
    console.log(`\n--- [SMS SENT ON ISSUE] ---`);
    console.log(`To: ${patientPhone}`);
    console.log(`Message: ${smsMessage}`);
    console.log(`-----------------------------\n`);

    // Log to SMSLog collection
    await SMSLog.create({
      patientName,
      phone: patientPhone,
      message: smsMessage,
      status: 'sent',
      type: 'issue',
    });

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `New token issued: Token ${newToken.tokenNumber} for ${patientName}.`);

    // Check for alerts
    await checkAndSendSMSAlerts(doctorId, io);

    res.status(201).json({
      ...newToken.toObject(),
      estimatedWaitTime: estWaitTime,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update token status (serve, complete, skip)
// @route   PATCH /api/queue/token/:tokenId
// @access  Private (Admin / Staff)
export const updateTokenStatus = async (req, res) => {
  const { status, skipReason, doctorNotes } = req.body; // 'waiting', 'serving', 'completed', 'skipped'

  try {
    const token = await Token.findById(req.params.tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found.' });
    }

    if (status) {
      token.status = status;
      if (status === 'serving') {
        token.startTime = new Date();
      } else if (status === 'completed' || status === 'skipped') {
        token.endTime = new Date();
        if (status === 'skipped' && skipReason) {
          token.skipReason = skipReason;
        }
      }
    }

    if (doctorNotes !== undefined) {
      token.doctorNotes = doctorNotes;
    }

    if (req.body.prescription !== undefined) {
      token.prescription = req.body.prescription;
    }

    await token.save();

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Token ${token.tokenNumber} status updated to ${status || token.status}.`);

    // Trigger SMS alerts for upcoming patients since queue advanced
    if (status && (status === 'serving' || status === 'completed' || status === 'skipped')) {
      await checkAndSendSMSAlerts(token.doctor, io);
    }

    res.json(token);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Re-queue a skipped patient token to the end of queue
// @route   POST /api/queue/token/:tokenId/requeue
// @access  Private (Admin / Staff)
export const reQueueToken = async (req, res) => {
  try {
    const token = await Token.findById(req.params.tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found.' });
    }

    if (token.status !== 'skipped') {
      return res.status(400).json({ message: 'Only skipped tokens can be re-queued.' });
    }

    const today = getTodayStr();
    
    // Find last sequence today for this doctor
    const lastToken = await Token.findOne({ doctor: token.doctor, date: today }).sort({ sequence: -1 });
    const newSequence = lastToken ? lastToken.sequence + 1 : 1;

    token.status = 'waiting';
    token.sequence = newSequence;
    token.reQueued = true;
    token.skipReason = undefined;
    token.startTime = undefined;
    token.endTime = undefined;
    await token.save();

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Token ${token.tokenNumber} re-added to active queue.`);

    await checkAndSendSMSAlerts(token.doctor, io);

    res.json(token);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Transfer token from one doctor to another
// @route   POST /api/queue/token/:tokenId/transfer
// @access  Private (Admin only)
export const transferToken = async (req, res) => {
  const { newDoctorId } = req.body;

  try {
    const token = await Token.findById(req.params.tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found.' });
    }

    const newDoctor = await Staff.findById(newDoctorId);
    if (!newDoctor || newDoctor.role !== 'doctor') {
      return res.status(404).json({ message: 'Target doctor not found.' });
    }

    const today = getTodayStr();
    const oldDoctorId = token.doctor;

    // Get configuration for target doctor prefix/etc.
    const clinic = await Clinic.findOne();
    const prefix = clinic ? clinic.queueConfig.tokenPrefix : 'TK';
    const startNum = clinic ? clinic.queueConfig.tokenStartNumber : 1;

    // Find last sequence today for the new doctor
    const lastToken = await Token.findOne({ doctor: newDoctorId, date: today }).sort({ sequence: -1 });
    const sequence = lastToken ? lastToken.sequence + 1 : 1;

    // Generate new token number based on total created tokens today for target doctor to ensure uniqueness
    const targetTodayTokensCount = await Token.countDocuments({ doctor: newDoctorId, date: today });
    const tokenNumberNum = startNum + targetTodayTokensCount;
    const tokenNumber = `${prefix}${tokenNumberNum.toString().padStart(3, '0')}`;

    token.doctor = newDoctorId;
    token.sequence = sequence;
    token.tokenNumber = tokenNumber;
    token.status = 'waiting';
    token.startTime = undefined;
    token.endTime = undefined;
    
    await token.save();

    // Set target doctor status to active if offline
    if (newDoctor.availabilityStatus === 'offline') {
      newDoctor.availabilityStatus = 'active';
      await newDoctor.save();
    }

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Token ${token.tokenNumber} transferred to Dr. ${newDoctor.name}.`);

    // Trigger alerts on both old and new queues
    await checkAndSendSMSAlerts(oldDoctorId, io);
    await checkAndSendSMSAlerts(newDoctorId, io);

    res.json(token);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset entire day's queue manually
// @route   POST /api/queue/reset
// @access  Private (Admin only)
export const resetQueue = async (req, res) => {
  try {
    const today = getTodayStr();

    // Instead of deleting, skip remaining active tokens with a note
    const result = await Token.updateMany(
      { date: today, status: { $in: ['waiting', 'serving'] } },
      {
        $set: {
          status: 'skipped',
          skipReason: `Queue reset manually by Admin (${req.user.name})`,
          endTime: new Date(),
        },
      }
    );

    // Turn doctors to offline / stopped
    await Staff.updateMany({ role: 'doctor' }, { $set: { availabilityStatus: 'offline' } });

    console.log(`[QUEUE RESET] Admin ID: ${req.user._id} reset all queues today (${today}).`);

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `All active queues have been reset by Admin.`);

    res.json({
      message: 'Queue reset successfully. All active sessions have been completed/cancelled.',
      affectedTokensCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Call next patient to announce on waiting TV
// @route   POST /api/queue/token/:tokenId/call
// @access  Private (Admin / Staff)
export const callPatient = async (req, res) => {
  try {
    const token = await Token.findById(req.params.tokenId).populate('doctor', 'name');
    if (!token) {
      return res.status(404).json({ message: 'Token not found.' });
    }

    const io = req.app.get('socketio');
    if (io) {
      io.emit('callPatient', {
        tokenNumber: token.tokenNumber,
        patientName: token.patientName,
        doctorName: token.doctor?.name || 'Doctor',
      });
    }

    res.json({ message: `Called patient ${token.patientName} (${token.tokenNumber}).` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Emergency call a patient to announce urgently on waiting TV
// @route   POST /api/queue/token/:tokenId/emergency-call
// @access  Private (Admin / Staff)
export const emergencyCallPatient = async (req, res) => {
  try {
    const token = await Token.findById(req.params.tokenId).populate('doctor', 'name');
    if (!token) {
      return res.status(404).json({ message: 'Token not found.' });
    }

    const io = req.app.get('socketio');
    if (io) {
      io.emit('emergencyCall', {
        tokenNumber: token.tokenNumber,
        patientName: token.patientName,
        doctorName: token.doctor?.name || 'Doctor',
      });
    }

    res.json({ message: `Emergency called patient ${token.patientName} (${token.tokenNumber}).` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send custom manual SMS to patient
// @route   POST /api/queue/token/:tokenId/sms
// @access  Private (Admin / Staff)
export const sendManualSMS = async (req, res) => {
  const { message } = req.body;
  try {
    const token = await Token.findById(req.params.tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found.' });
    }

    console.log(`\n--- [MANUAL SMS SENT] ---`);
    console.log(`To: ${token.patientPhone}`);
    console.log(`Message: ${message}`);
    console.log(`-------------------------\n`);

    // Log to SMSLog
    await SMSLog.create({
      patientName: token.patientName,
      phone: token.patientPhone || 'N/A',
      message: message,
      status: 'sent',
      type: 'manual',
    });

    res.json({ message: 'Manual SMS message sent successfully (simulated).' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all SMS logs sent today
// @route   GET /api/queue/sms-logs
// @access  Private (Admin / Staff)
export const getSMSLogs = async (req, res) => {
  try {
    const today = getTodayStr();
    
    // Find logs created today
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = await SMSLog.find({
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ timestamp: -1 });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk block range of tokens (Admin only)
// @route   POST /api/queue/bulk-block
// @access  Private (Admin only)
export const bulkBlockTokens = async (req, res) => {
  const { doctorId, blockCount } = req.body;

  try {
    const today = getTodayStr();
    
    const doctor = await Staff.findById(doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const clinic = await Clinic.findOne();
    const prefix = clinic ? clinic.queueConfig.tokenPrefix : 'TK';
    const startNum = clinic ? clinic.queueConfig.tokenStartNumber : 1;

    // Get current max sequence
    const lastToken = await Token.findOne({ doctor: doctorId, date: today }).sort({ sequence: -1 });
    let startSeq = lastToken ? lastToken.sequence + 1 : 1;

    const blockedTokens = [];

    const todayTokensCount = await Token.countDocuments({ doctor: doctorId, date: today });
    for (let i = 0; i < blockCount; i++) {
      const sequence = startSeq + i;
      const tokenNumberNum = startNum + todayTokensCount + i;
      const tokenNumber = `${prefix}${tokenNumberNum.toString().padStart(3, '0')}`;

      blockedTokens.push({
        tokenNumber,
        sequence,
        patientName: 'Blocked / reserved camp',
        patientPhone: '0000000000',
        doctor: doctorId,
        status: 'skipped', // treated as skipped sequence
        skipReason: 'Bulk block for clinic session',
        date: today,
      });
    }

    await Token.insertMany(blockedTokens);

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Bulk blocked range of ${blockCount} token(s) for Dr. ${doctor.name}.`);

    res.json({ message: `Successfully blocked range of ${blockCount} token(s).` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    End doctor session for the day (closes queue, notifies pending patients)
// @route   POST /api/queue/doctor/:doctorId/end-session
// @access  Private (Doctor / Admin)
export const endDoctorSession = async (req, res) => {
  try {
    const doctor = await Staff.findById(req.params.doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const today = getTodayStr();
    
    // Find all waiting/serving tokens today for this doctor
    const pendingTokens = await Token.find({
      doctor: doctor._id,
      date: today,
      status: { $in: ['waiting', 'serving'] }
    });

    // Notify pending patients via SMS (simulated) and update their status to skipped
    for (const token of pendingTokens) {
      token.status = 'skipped';
      token.skipReason = 'Doctor ended session for today';
      token.endTime = new Date();
      await token.save();

      if (token.patientPhone) {
        const smsMessage = `Dear ${token.patientName}, Dr. ${doctor.name} has ended their session for today. Your token ${token.tokenNumber} is cancelled. Please re-book for tomorrow.`;
        console.log(`\n--- [SMS SENT ON SESSION END] ---`);
        console.log(`To: ${token.patientPhone}`);
        console.log(`Message: ${smsMessage}`);
        console.log(`---------------------------------\n`);

        await SMSLog.create({
          patientName: token.patientName,
          phone: token.patientPhone,
          message: smsMessage,
          status: 'sent',
          type: 'alert'
        });
      }
    }

    doctor.availabilityStatus = 'offline';
    doctor.pauseReason = undefined;
    await doctor.save();

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Consultation session ended for Dr. ${doctor.name}.`);

    res.json({
      message: 'Session ended successfully. Pending patients have been notified.',
      notifiedCount: pendingTokens.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get doctor stats
// @route   GET /api/queue/doctor/:doctorId/stats
// @access  Private (Doctor / Admin)
export const getDoctorStats = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const today = getTodayStr();

    // 1. Patients seen today (completed tokens today)
    const completedToday = await Token.find({
      doctor: doctorId,
      date: today,
      status: 'completed'
    }).sort({ sequence: 1 });

    // 2. Avg consultation time today
    let avgConsultationTimeMinutes = 0;
    const completedWithDuration = completedToday.filter(t => t.startTime && t.endTime);
    if (completedWithDuration.length > 0) {
      const totalDurationMs = completedWithDuration.reduce((acc, token) => {
        return acc + (new Date(token.endTime) - new Date(token.startTime));
      }, 0);
      const totalDurationMinutes = totalDurationMs / 60000;
      avgConsultationTimeMinutes = Math.round(totalDurationMinutes / completedWithDuration.length * 10) / 10;
    }

    // 3. Weekly summary (last 7 days, including today)
    const weeklySummary = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = await Token.countDocuments({
        doctor: doctorId,
        date: dateStr,
        status: 'completed'
      });
      
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }); // e.g. Mon, Tue
      weeklySummary.push({
        date: dateStr,
        day: dayName,
        count
      });
    }

    // 4. Total earnings today
    const totalEarnings = completedToday.reduce((sum, token) => sum + (token.consultationFee || 200), 0);

    // 5. Patient logs today (completed and skipped)
    const completedLogs = await Token.find({
      doctor: doctorId,
      date: today,
      status: { $in: ['completed', 'skipped'] }
    }).sort({ updatedAt: -1 });

    res.json({
      seenToday: completedToday.length,
      avgConsultationTime: avgConsultationTimeMinutes,
      weeklySummary,
      totalEarnings,
      completedLogs
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Re-order remaining waiting tokens sequence
// @route   POST /api/queue/reorder
// @access  Private (Doctor / Admin)
export const reorderTokens = async (req, res) => {
  const { doctorId, orderedIds } = req.body;

  try {
    if (!doctorId || !Array.isArray(orderedIds)) {
      return res.status(400).json({ message: 'Invalid payload. doctorId and orderedIds (array) required.' });
    }

    // Set sequence for each token based on the array index
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, doctor: doctorId, status: 'waiting' },
        update: { $set: { sequence: index + 1 } }
      }
    }));

    await Token.bulkWrite(bulkOps);

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Queue waitlist re-ordered by staff.`);

    res.json({ message: 'Queue sequence re-ordered successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update doctor custom average consultation pacing
// @route   PATCH /api/queue/doctor/:doctorId/pacing
// @access  Private (Doctor / Admin)
export const updateDoctorPacing = async (req, res) => {
  const { consultationTimeMinutes } = req.body;

  try {
    const doctor = await Staff.findById(req.params.doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    doctor.consultationTimeMinutes = parseInt(consultationTimeMinutes, 10) || 8;
    await doctor.save();

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Average pacing time updated for Dr. ${doctor.name}.`);

    res.json({ message: 'Consultation pacing updated successfully.', doctor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get public clinic and active doctor details
// @route   GET /api/queue/public/clinic
// @access  Public
export const getPublicClinicInfo = async (req, res) => {
  try {
    const today = req.query.date || getTodayStr();
    const clinic = await Clinic.findOne() || {};
    
    // 1. Get doctors on approved leave today/target date
    const doctorLeavesToday = await Leave.find({
      leaveType: 'staff',
      date: today,
      status: 'approved'
    }).distinct('staffId');

    // 2. Fetch all active doctors (patients can book for future dates even if offline/on leave today)
    const doctors = await Staff.find({
      role: 'doctor',
      isActive: true
    }).select('name specializations availabilityStatus pauseReason consultationTimeMinutes');

    const doctorsWithQueues = await Promise.all(
      doctors.map(async (doc) => {
        const waitingCount = await Token.countDocuments({
          doctor: doc._id,
          date: today,
          status: 'waiting'
        });
        const hasServing = await Token.countDocuments({
          doctor: doc._id,
          date: today,
          status: 'serving'
        });
        const totalAhead = waitingCount + hasServing;
        const avgTime = doc.consultationTimeMinutes || clinic.consultationTimeMinutes || 8;
        const estWaitTime = totalAhead * avgTime;

        const isOnLeave = doctorLeavesToday.map(id => id.toString()).includes(doc._id.toString());
        const maxTokensLimit = clinic.queueConfig?.maxTokensPerDoctor || 50;
        const isLimitReached = totalAhead >= maxTokensLimit;

        return {
          _id: doc._id,
          name: doc.name,
          specializations: doc.specializations,
          availabilityStatus: doc.availabilityStatus,
          pauseReason: doc.pauseReason,
          waitingCount,
          estWaitTime,
          isOnLeave,
          isLimitReached
        };
      })
    );

    // Check if clinic leave exists today
    const clinicLeaveToday = await Leave.findOne({ leaveType: 'clinic', date: today, status: 'approved' });
    const isHoliday = (clinic.holidayMode && clinic.holidayMode.isActive) || !!clinicLeaveToday;
    const holidayMessage = clinicLeaveToday 
      ? (clinicLeaveToday.reason || 'Clinic Holiday')
      : (clinic.holidayMode?.message || 'Clinic is closed for today.');

    res.json({
      clinicName: clinic.name || 'DocQueue Clinic',
      holidayMode: {
        isActive: isHoliday,
        message: holidayMessage
      },
      whatsappConfig: clinic.whatsappConfig || { isEnabled: false, number: '' },
      noticeConfig: clinic.noticeConfig || { isEnabled: true, message: '' },
      doctors: doctorsWithQueues
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Public patient self-registration (with advance booking support)
// @route   POST /api/queue/public/register
// @access  Private (Patient Auth)
export const registerPublicTokens = async (req, res) => {
  const { patientName, doctorIds, date } = req.body;
  const patientPhone = req.patient.phone;

  try {
    if (!doctorIds || !Array.isArray(doctorIds) || doctorIds.length === 0) {
      return res.status(400).json({ message: 'Please select at least one doctor.' });
    }

    // Default to today if date not provided or is invalid
    const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayStr();
    
    // Check if target date is in the past
    const today = getTodayStr();
    if (targetDate < today) {
      return res.status(400).json({ message: 'Cannot book appointments for past dates.' });
    }

    const clinic = await Clinic.findOne();

    // 2. Max tokens per phone check: max 3 tokens per phone number per day on that targeted date
    const existingTokens = await Token.find({
      patientPhone,
      date: targetDate,
      status: { $in: ['waiting', 'serving', 'completed'] }
    });

    const totalNewAndExisting = existingTokens.length + doctorIds.filter(id => 
      !existingTokens.some(t => t.doctor.toString() === id)
    ).length;

    if (totalNewAndExisting > 3) {
      return res.status(400).json({ 
        message: `You can only book up to 3 tokens per day. You currently have ${existingTokens.length} active token(s) booked for ${targetDate}.` 
      });
    }

    const issuedTokens = [];
    
    // Check clinic-wide leave on the target date
    const clinicLeave = await Leave.findOne({ leaveType: 'clinic', date: targetDate, status: 'approved' });
    if (clinicLeave) {
      return res.status(400).json({ message: `Clinic is closed on ${targetDate} (Reason: ${clinicLeave.reason || 'Holiday'}).` });
    }

    for (const doctorId of doctorIds) {
      // Check if doctor exists and is active (account not disabled)
      const doctor = await Staff.findById(doctorId);
      if (!doctor || doctor.role !== 'doctor' || !doctor.isActive) {
        return res.status(400).json({ message: `Dr. ${doctor ? doctor.name : ''} is not available for booking.` });
      }

      // Check if doctor has an approved leave on this date
      const doctorLeave = await Leave.findOne({ leaveType: 'staff', staffId: doctorId, date: targetDate, status: 'approved' });
      if (doctorLeave) {
        return res.status(400).json({ message: `Dr. ${doctor.name} is on approved leave on ${targetDate}.` });
      }

      // If booking for today, check if doctor availability status is offline (session ended)
      if (targetDate === today && doctor.availabilityStatus === 'offline') {
        return res.status(400).json({ message: `Dr. ${doctor.name} has ended their consultation session for today. Booking is not possible.` });
      }

      // Duplicate check: if already in queue (waiting or serving) for this doctor, reuse existing
      const existingToken = existingTokens.find(t => t.doctor.toString() === doctorId && ['waiting', 'serving'].includes(t.status));
      if (existingToken) {
        issuedTokens.push(existingToken);
        continue;
      }

      // Check daily limit for doctor on target date
      const maxTokensLimit = clinic ? clinic.queueConfig.maxTokensPerDoctor : 50;
      const currentTokenCount = await Token.countDocuments({ doctor: doctorId, date: targetDate });
      if (currentTokenCount >= maxTokensLimit) {
        return res.status(400).json({ message: `Registration is closed for Dr. ${doctor.name} on ${targetDate} (daily limit reached).` });
      }

      // Generate sequence & token number for target date
      const prefix = clinic ? clinic.queueConfig.tokenPrefix : 'TK';
      const startNum = clinic ? clinic.queueConfig.tokenStartNumber : 1;

      const lastToken = await Token.findOne({ doctor: doctorId, date: targetDate }).sort({ sequence: -1 });
      const sequence = lastToken ? lastToken.sequence + 1 : 1;
      const tokenNumberNum = startNum + currentTokenCount;
      const tokenNumber = `${prefix}${tokenNumberNum.toString().padStart(3, '0')}`;

      // Create Token
      const token = await Token.create({
        tokenNumber,
        sequence,
        patientName: patientName?.trim() || req.patient.name || 'Anonymous',
        patientPhone,
        doctor: doctorId,
        status: 'waiting',
        date: targetDate,
        consultationFee: 200,
      });

      // Trigger SMS notification
      const estWaitTime = sequence * (doctor.consultationTimeMinutes || clinic.consultationTimeMinutes || 8);
      const smsMessage = `Your DocQueue token is ${tokenNumber} for ${targetDate} at ${clinic ? clinic.name : 'DocQueue Clinic'}. Dr. ${doctor.name}. Est. wait: ${estWaitTime} min. Track: http://localhost:5174/patient/track?phone=${patientPhone}`;
      
      console.log(`\n--- [SMS SENT TO PATIENT] ---`);
      console.log(`To: ${patientPhone}`);
      console.log(`Message: ${smsMessage}`);
      console.log(`------------------------------\n`);

      // Log SMS
      await SMSLog.create({
        patientName: token.patientName,
        phone: patientPhone,
        message: smsMessage,
        status: 'sent',
        type: 'issue'
      });

      issuedTokens.push(token);
    }

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `New registration: ${issuedTokens.length} token(s) booked.`);

    res.status(201).json({
      message: 'Tokens issued successfully.',
      tokens: issuedTokens
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get patient active tokens today (Protected)
// @route   GET /api/queue/public/tokens
// @access  Private (Patient Auth)
export const getPatientTokens = async (req, res) => {
  const phone = req.patient.phone;

  try {
    const today = getTodayStr();
    const clinic = await Clinic.findOne() || {};

    // Find all active tokens today or in the future for this phone
    const tokens = await Token.find({
      patientPhone: phone,
      date: { $gte: today },
      status: { $in: ['waiting', 'serving'] }
    }).populate('doctor', 'name specializations availabilityStatus pauseReason').sort({ date: 1, createdAt: 1 });

    // For each token, calculate position and est. wait time
    const tokensWithQueueDetails = await Promise.all(
      tokens.map(async (token) => {
        let position = 0;
        let estWaitTime = 0;

        if (token.status === 'waiting' && token.date === today) {
          // Position is how many waiting tokens are ahead + 1 (serving counts if it exists)
          const waitingAhead = await Token.countDocuments({
            doctor: token.doctor._id,
            date: today,
            status: 'waiting',
            sequence: { $lt: token.sequence }
          });
          const hasServing = await Token.countDocuments({
            doctor: token.doctor._id,
            date: today,
            status: 'serving'
          });
          position = waitingAhead + 1;
          
          const avgTime = token.doctor?.consultationTimeMinutes || clinic.consultationTimeMinutes || 8;
          estWaitTime = (waitingAhead + hasServing) * avgTime;
        } else if (token.status === 'waiting' && token.date > today) {
          // Future booking has sequence as wait position directly
          position = token.sequence;
          const avgTime = token.doctor?.consultationTimeMinutes || clinic.consultationTimeMinutes || 8;
          estWaitTime = token.sequence * avgTime;
        }

        // Retrieve serving token number
        const servingTokenObj = await Token.findOne({
          doctor: token.doctor._id,
          date: today,
          status: 'serving'
        });

        return {
          ...token.toObject(),
          position,
          estWaitTime,
          servingTokenNumber: servingTokenObj ? servingTokenObj.tokenNumber : null
        };
      })
    );

    res.json({
      clinicName: clinic.name || 'DocQueue Clinic',
      tokens: tokensWithQueueDetails
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Cancel a single token (Protected)
// @route   POST /api/queue/public/cancel-token
// @access  Private (Patient Auth)
export const cancelPatientToken = async (req, res) => {
  const { tokenId } = req.body;
  const phone = req.patient.phone;

  try {
    const token = await Token.findById(tokenId).populate('doctor', 'name');
    if (!token) {
      return res.status(404).json({ message: 'Token not found.' });
    }

    // Security check
    if (token.patientPhone !== phone) {
      return res.status(403).json({ message: 'You are not authorized to cancel this token.' });
    }

    if (token.status !== 'waiting') {
      return res.status(400).json({ message: `Cannot cancel a token that is currently ${token.status}.` });
    }

    token.status = 'skipped';
    token.skipReason = 'Cancelled by Patient';
    token.endTime = new Date();
    await token.save();

    const io = req.app.get('socketio');
    await emitQueueUpdate(io, `Token ${token.tokenNumber} cancelled by patient.`);

    // Trigger SMS alerts for upcoming patients since queue advanced
    await checkAndSendSMSAlerts(token.doctor._id, io);

    res.json({ message: 'Token cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send OTP to patient phone number
// @route   POST /api/queue/public/auth/send-otp
// @access  Public
export const sendPatientOTP = async (req, res) => {
  const { phone, name, age, gender } = req.body;

  try {
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phone || !phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit Indian phone number.' });
    }

    // Check if patient exists, or create a new document
    let patient = await Patient.findOne({ phone });
    if (!patient) {
      if (!name || !age || !gender) {
        return res.status(200).json({
          isNewUser: true,
          message: 'Account does not exist. Please fill out details to register.'
        });
      }
      patient = new Patient({
        phone,
        name,
        age: Number(age),
        gender
      });
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60000); // 5 minutes expiration

    patient.otp = otp;
    patient.otpExpires = expires;
    await patient.save();

    // Log the OTP and send simulated SMS
    const smsMessage = `Your DocQueue verification OTP code is ${otp}. It is valid for 5 minutes.`;
    
    console.log(`\n==================================================`);
    console.log(`PATIENT SIGN-IN OTP SENT TO ${phone}`);
    console.log(`OTP Code: ${otp}`);
    console.log(`==================================================\n`);

    await SMSLog.create({
      patientName: patient.name || 'Anonymous',
      phone,
      message: smsMessage,
      status: 'sent',
      type: 'otp'
    });

    res.json({
      isNewUser: false,
      message: 'OTP sent successfully (check SMS log tab / terminal console).',
      otp: otp
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Verify OTP and return patient JWT token
// @route   POST /api/queue/public/auth/verify-otp
// @access  Public
export const verifyPatientOTP = async (req, res) => {
  const { phone, otp } = req.body;

  try {
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Please provide phone and OTP.' });
    }

    const patient = await Patient.findOne({ phone });
    if (!patient || !patient.otp || patient.otp !== otp) {
      return res.status(400).json({ message: 'Invalid verification OTP code.' });
    }

    if (patient.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'Verification OTP code has expired. Please send a new one.' });
    }

    // Clear verification OTP
    patient.otp = undefined;
    patient.otpExpires = undefined;
    await patient.save();

    // Sign JWT Token for patient
    const token = jwt.sign(
      { id: patient._id, phone: patient.phone },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '30d' }
    );

    const clinic = await Clinic.findOne() || {};

    res.json({
      message: 'OTP verified successfully.',
      token,
      userId: patient._id,
      tenantId: clinic._id || 'default_tenant',
      patient: {
        _id: patient._id,
        phone: patient.phone,
        name: patient.name,
        age: patient.age,
        gender: patient.gender
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get patient full booking history
// @route   GET /api/queue/public/history
// @access  Private (Patient Auth)
export const getPatientHistory = async (req, res) => {
  const phone = req.patient.phone;

  try {
    // Find all past or completed/skipped tokens today or in the past
    const history = await Token.find({
      patientPhone: phone
    }).populate('doctor', 'name specializations').sort({ date: -1, createdAt: -1 });

    res.json({ history });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get patient full booking history for Doctor
// @route   GET /api/queue/patient/:phone/history
// @access  Private (Staff)
export const getPatientHistoryForDoctor = async (req, res) => {
  const { phone } = req.params;

  try {
    const history = await Token.find({
      patientPhone: phone,
      status: { $in: ['completed', 'skipped'] }
    }).populate('doctor', 'name specializations').sort({ date: -1, createdAt: -1 });

    const patientInfo = await Patient.findOne({ phone });

    res.json({ history, patientInfo });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update patient profile details (Name)
// @route   PUT /api/queue/public/profile
// @access  Private (Patient Auth)
export const updatePatientProfile = async (req, res) => {
  const { name } = req.body;
  const patientId = req.patient._id;

  try {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    if (name !== undefined) {
      patient.name = name;
    }

    const updatedPatient = await patient.save();
    res.json({
      message: 'Profile updated successfully.',
      patient: {
        _id: updatedPatient._id,
        phone: updatedPatient.phone,
        name: updatedPatient.name
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

