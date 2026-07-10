import Clinic from '../../models/Clinic.js';
import { triggerNotification } from '../shared/notificationController.js';

// Helper to get or create the single Clinic configuration document
const getOrCreateClinic = async () => {
  let clinic = await Clinic.findOne();
  if (!clinic) {
    clinic = await Clinic.create({
      name: 'Default Clinic',
      address: '123 Health Street',
      pincode: '600001',
      city: 'Chennai',
      state: 'Tamil Nadu',
      phone: '9876543210',
      email: 'contact@defaultclinic.com',
    });
  }
  return clinic;
};

// @desc    Get clinic configuration
// @route   GET /api/clinic
// @access  Private (Admin / Staff)
export const getClinic = async (req, res) => {
  try {
    const clinic = await getOrCreateClinic();
    res.json(clinic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update clinic profile / configuration
// @route   PUT /api/clinic
// @access  Private (Admin only)
export const updateClinic = async (req, res) => {
  try {
    const clinic = await getOrCreateClinic();

    const fieldsToUpdate = [
      'name',
      'address',
      'pincode',
      'city',
      'state',
      'phone',
      'email',
      'logo',
      'workingHours',
      'specializations',
      'queueConfig',
      'consultationTimeMinutes',
      'tokenResetTime',
      'smsAlertPositionsAhead',
      'whatsappConfig',
      'noticeConfig',
    ];

    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        clinic[field] = req.body[field];
      }
    });

    const updatedClinic = await clinic.save();
    res.json(updatedClinic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle holiday mode for the clinic
// @route   POST /api/clinic/holiday
// @access  Private (Admin only)
export const toggleHolidayMode = async (req, res) => {
  const { isActive, message } = req.body;

  try {
    const clinic = await getOrCreateClinic();
    clinic.holidayMode.isActive = isActive;
    if (message !== undefined) {
      clinic.holidayMode.message = message;
    }

    const updatedClinic = await clinic.save();
    
    const io = req.app.get('socketio');
    if (io) {
      io.emit('holidayModeUpdate', updatedClinic.holidayMode);
      await triggerNotification(
        `Holiday Mode updated: Clinic queue is now ${updatedClinic.holidayMode.isActive ? 'CLOSED' : 'OPEN'}.`,
        'queue',
        'all',
        io
      );
    }

    res.json(updatedClinic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
