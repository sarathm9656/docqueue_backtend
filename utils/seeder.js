import bcrypt from 'bcryptjs';
import Admin from '../models/Admin.js';
import Clinic from '../models/Clinic.js';
import Staff from '../models/Staff.js';
import Token from '../models/Token.js';
import Subscription from '../models/Subscription.js';
import Medicine from '../models/Medicine.js';

// Seed all default data if database is empty
export const seedAllData = async () => {
  try {
    // 1. Seed Admin using configurable environment variables
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'sarathmullath9656@gmail.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Asd@123';
    const adminName = process.env.DEFAULT_ADMIN_NAME || 'manu';
    const adminPhone = process.env.DEFAULT_ADMIN_PHONE || '9876543210';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);
    let admin = await Admin.findOne({ email: adminEmail });

    if (!admin) {
      await Admin.create({
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        phone: adminPhone,
        isFirstLogin: true, // will force password change on first login
      });
      console.log('\n==================================================');
      console.log('SEED DATA: Default admin account created!');
      console.log(`Email: ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
      console.log('==================================================\n');
    } else {
      admin.password = hashedPassword;
      await admin.save();
      console.log('\n==================================================');
      console.log(`SEED DATA: Default admin password reset to ${adminPassword}`);
      console.log('==================================================\n');
    }

    // 2. Seed Subscription (Pro plan active)
    const subCount = await Subscription.countDocuments();
    if (subCount === 0) {
      await Subscription.create({
        plan: 'Pro',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        maxDoctors: 10,
        invoices: [
          {
            invoiceId: 'INV-' + Math.floor(100000 + Math.random() * 900000),
            amount: 1999,
            plan: 'Pro',
            status: 'paid',
            date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          }
        ]
      });
      console.log('SEED DATA: Pro Subscription created.');
    }

    // 3. Seed Clinic Config
    const clinicCount = await Clinic.countDocuments();
    if (clinicCount === 0) {
      await Clinic.create({
        name: 'Jenkins Multi-Specialty Clinic',
        address: '102 Blue Ridge Road, Adyar',
        pincode: '600020',
        city: 'Chennai',
        state: 'Tamil Nadu',
        phone: '04424458900',
        email: 'support@jenkinsclinic.com',
        specializations: ['General Medicine', 'Cardiology', 'Pediatrics', 'Dermatology'],
        queueConfig: {
          maxTokensPerDoctor: 50,
          tokenStartNumber: 1,
          tokenPrefix: 'JK',
        },
        consultationTimeMinutes: 10,
      });
      console.log('SEED DATA: Clinic configuration created.');
    }

    // 4. Seed Staff (Doctors and Receptionists)
    const staffCount = await Staff.countDocuments();
    let doc1, doc2;
    if (staffCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const docPassword = await bcrypt.hash('Doctor123', salt);
      const recepPassword = await bcrypt.hash('Merlin123', salt);

      doc1 = await Staff.create({
        name: 'Arthur Pendragon',
        email: 'arthur@clinic.com',
        phone: '9876500001',
        password: docPassword,
        role: 'doctor',
        specializations: ['General Medicine'],
        availabilityStatus: 'active',
      });

      doc2 = await Staff.create({
        name: 'Guinevere Pendragon',
        email: 'guinevere@clinic.com',
        phone: '9876500002',
        password: docPassword,
        role: 'doctor',
        specializations: ['Cardiology'],
        availabilityStatus: 'active',
      });

      await Staff.create({
        name: 'Merlin Ambrosius',
        email: 'merlin@clinic.com',
        phone: '9876500003',
        password: recepPassword,
        role: 'receptionist',
      });

      console.log('SEED DATA: Doctors & Receptionist created.');
      console.log('Doctor: arthur@clinic.com / Doctor123');
      console.log('Doctor: guinevere@clinic.com / Doctor123');
      console.log('Receptionist: merlin@clinic.com / Merlin123');
    } else {
      const docs = await Staff.find({ role: 'doctor' });
      doc1 = docs[0];
      doc2 = docs[1];
    }

    // 5. Seed historical tokens for past 7 days
    const tokenCount = await Token.countDocuments();
    if (tokenCount === 0 && doc1 && doc2) {
      const today = new Date();
      const statuses = ['completed', 'completed', 'completed', 'skipped', 'completed'];

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        // Seed 4-8 tokens per day
        const numTokens = Math.floor(Math.random() * 5) + 4;
        for (let j = 0; j < numTokens; j++) {
          const doc = j % 2 === 0 ? doc1 : doc2;
          const status = i === 0 && j >= numTokens - 2 ? 'waiting' : statuses[Math.floor(Math.random() * statuses.length)];
          const seq = j + 1;
          const checkIn = new Date(date);
          checkIn.setHours(9 + Math.floor(j / 2), (j % 2) * 20 + Math.floor(Math.random() * 15), 0);
          
          let start, end;
          if (status === 'completed' || status === 'serving') {
            start = new Date(checkIn);
            start.setMinutes(start.getMinutes() + Math.floor(Math.random() * 15) + 5);
          }
          if (status === 'completed') {
            end = new Date(start);
            end.setMinutes(end.getMinutes() + Math.floor(Math.random() * 10) + 5);
          }

          await Token.create({
            tokenNumber: `JK${String(seq).padStart(3, '0')}`,
            sequence: seq,
            patientName: `Patient ${dateStr.slice(-2)}-${seq}`,
            patientPhone: `9876543${seq.toString().padStart(3, '0')}`,
            doctor: doc._id,
            status,
            date: dateStr,
            checkInTime: checkIn,
            startTime: start,
            endTime: end,
            skipReason: status === 'skipped' ? 'No show after announcements' : undefined,
            consultationFee: 250,
          });
        }
      }
      console.log('SEED DATA: Historical patient tokens generated.');
    }

    // 6. Seed Medicines
    const medicineCount = await Medicine.countDocuments();
    if (medicineCount === 0) {
      const initialMedicines = [
        { name: 'Paracetamol 650', type: 'Tablet', defaultDosage: '650mg', defaultFrequency: '1-0-1', defaultDuration: '3 days', defaultInstructions: 'After food' },
        { name: 'Amoxicillin 500', type: 'Capsule', defaultDosage: '500mg', defaultFrequency: '1-1-1', defaultDuration: '5 days', defaultInstructions: 'After food' },
        { name: 'Ibuprofen 400', type: 'Tablet', defaultDosage: '400mg', defaultFrequency: '1-0-1', defaultDuration: '3 days', defaultInstructions: 'After food' },
        { name: 'Cetirizine 10', type: 'Tablet', defaultDosage: '10mg', defaultFrequency: '0-0-1', defaultDuration: '5 days', defaultInstructions: 'Before bed' },
        { name: 'Metformin 500', type: 'Tablet', defaultDosage: '500mg', defaultFrequency: '1-0-1', defaultDuration: '30 days', defaultInstructions: 'With food' },
        { name: 'Pantoprazole 40', type: 'Tablet', defaultDosage: '40mg', defaultFrequency: '1-0-0', defaultDuration: '10 days', defaultInstructions: 'Before food' },
        { name: 'Atorvastatin 10', type: 'Tablet', defaultDosage: '10mg', defaultFrequency: '0-0-1', defaultDuration: '30 days', defaultInstructions: 'Before bed' },
        { name: 'Benadryl Syrup', type: 'Syrup', defaultDosage: '10ml', defaultFrequency: '1-1-1', defaultDuration: '5 days', defaultInstructions: 'After food' },
        { name: 'Otrivin Drops', type: 'Drops', defaultDosage: '2 drops', defaultFrequency: '1-0-1', defaultDuration: '5 days', defaultInstructions: 'Nasal use' },
        { name: 'Betadine Ointment', type: 'Ointment', defaultDosage: 'Apply gently', defaultFrequency: '1-0-1', defaultDuration: '7 days', defaultInstructions: 'External use' },
      ];
      await Medicine.create(initialMedicines);
      console.log('SEED DATA: Standard drug dictionary seeded.');
    }
  } catch (error) {
    console.error('Error seeding data:', error.message);
  }
};
