import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Staff from './models/Staff.js';

dotenv.config();

const migrate = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clinic_queue';
    await mongoose.connect(mongoURI);
    
    console.log('Fetching all staff accounts...');
    const staffMembers = await Staff.find({});
    
    let updatedCount = 0;
    for (const staff of staffMembers) {
      const isDefaultOnly = staff.permissions.length === 1 && staff.permissions[0] === 'queue';
      const needsUpdate = !staff.permissions || staff.permissions.length === 0 || (staff.role === 'receptionist' && isDefaultOnly);

      if (needsUpdate) {
        // Assign default permissions based on role
        if (staff.role === 'receptionist') {
          staff.permissions = ['queue', 'sms'];
        } else if (staff.role === 'doctor') {
          staff.permissions = ['queue'];
        } else {
          staff.permissions = ['queue'];
        }
        
        await staff.save();
        console.log(`Migrated permissions for: ${staff.name} (${staff.role}) -> ${staff.permissions.join(', ')}`);
        updatedCount++;
      } else {
        console.log(`Skipped: ${staff.name} (${staff.role}) -> ${staff.permissions.join(', ')}`);
      }
    }
    
    console.log(`Migration finished. Updated ${updatedCount} staff accounts.`);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration failed:', error);
  }
};

migrate();
