import mongoose from 'mongoose';

const workingHourSchema = new mongoose.Schema({
  day: { type: String, required: true },
  openTime: { type: String, default: '09:00' },
  closeTime: { type: String, default: '17:00' },
  isHoliday: { type: Boolean, default: false },
});

const clinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, default: 'My Clinic' },
    address: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    logo: { type: String, default: '' }, // base64 or URL
    workingHours: {
      type: [workingHourSchema],
      default: [
        { day: 'Monday', openTime: '09:00', closeTime: '17:00', isHoliday: false },
        { day: 'Tuesday', openTime: '09:00', closeTime: '17:00', isHoliday: false },
        { day: 'Wednesday', openTime: '09:00', closeTime: '17:00', isHoliday: false },
        { day: 'Thursday', openTime: '09:00', closeTime: '17:00', isHoliday: false },
        { day: 'Friday', openTime: '09:00', openTime: '09:00', closeTime: '17:00', isHoliday: false },
        { day: 'Saturday', openTime: '09:00', closeTime: '13:00', isHoliday: false },
        { day: 'Sunday', openTime: '09:00', closeTime: '13:00', isHoliday: true },
      ],
    },
    specializations: { type: [String], default: ['General Medicine'] },
    queueConfig: {
      maxTokensPerDoctor: { type: Number, default: 50 },
      tokenStartNumber: { type: Number, default: 1 },
      tokenPrefix: { type: String, default: 'TK' },
    },
    consultationTimeMinutes: { type: Number, default: 8 },
    tokenResetTime: { type: String, default: '00:00' }, // daily reset hour
    smsAlertPositionsAhead: { type: Number, default: 2 },
    holidayMode: {
      isActive: { type: Boolean, default: false },
      message: { type: String, default: 'Clinic is closed for today.' },
    },
    whatsappConfig: {
      isEnabled: { type: Boolean, default: false },
      number: { type: String, default: '' },
    },
    noticeConfig: {
      isEnabled: { type: Boolean, default: true },
      message: { type: String, default: 'Flu Vaccination Drive 2026 is active. Walk-in slots are open. Also, please note that doctor schedules might vary on weekends. Dr. Sharma will be taking an official break today between 2:00 PM and 3:00 PM.' },
    },
  },
  { timestamps: true }
);

const Clinic = mongoose.model('Clinic', clinicSchema);
export default Clinic;
