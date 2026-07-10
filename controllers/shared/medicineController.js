import Medicine from '../../models/Medicine.js';

// @desc    Get all medicines (for search/auto-fill)
// @route   GET /api/medicines
// @access  Private (Doctor)
export const getMedicines = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const medicines = await Medicine.find(query).limit(50).sort({ name: 1 });
    res.json(medicines);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch medicines', error: error.message });
  }
};

// @desc    Add a new medicine
// @route   POST /api/medicines
// @access  Private (Doctor/Admin)
export const addMedicine = async (req, res) => {
  try {
    const { name, type, defaultDosage, defaultFrequency, defaultDuration, defaultInstructions } = req.body;
    
    // Check if exists
    const existing = await Medicine.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ message: 'Medicine already exists in database' });
    }

    const medicine = await Medicine.create({
      name,
      type,
      defaultDosage,
      defaultFrequency,
      defaultDuration,
      defaultInstructions
    });

    res.status(201).json(medicine);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add medicine', error: error.message });
  }
};
