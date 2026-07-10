import Leave from '../../models/Leave.js';
import Staff from '../../models/Staff.js';
import { triggerNotification } from './notificationController.js';

// @desc    Get all leaves (filtered or full list)
// @route   GET /api/leaves
// @access  Private
export const getAllLeaves = async (req, res) => {
  try {
    const { staffId, month, year } = req.query;
    let query = {};

    if (staffId) {
      query.staffId = staffId;
    }

    if (month && year) {
      // Filter by regex or exact match depending on format (YYYY-MM)
      const prefix = `${year}-${month.toString().padStart(2, '0')}`;
      query.date = { $regex: `^${prefix}` };
    }

    const leaves = await Leave.find(query)
      .populate('staffId', 'name email role specializations')
      .sort({ date: 1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new leave
// @route   POST /api/leaves
// @access  Private
export const createLeave = async (req, res) => {
  const { leaveType, staffId, date, reason } = req.body;

  try {
    const isAdmin = req.role === 'admin';
    const isSelf = staffId && req.user && req.user._id.toString() === staffId.toString();

    // 1. Authorization checks
    if (!isAdmin && leaveType === 'clinic') {
      return res.status(403).json({ message: 'Access denied: Only clinic admins can add clinic-wide leaves.' });
    }

    if (!isAdmin && leaveType === 'staff' && !isSelf) {
      return res.status(403).json({ message: 'Access denied: You can only apply for your own leaves.' });
    }

    // 2. Validate staff ID exists if type is staff
    if (leaveType === 'staff') {
      const targetStaff = await Staff.findById(staffId);
      if (!targetStaff) {
        return res.status(404).json({ message: 'Staff member not found.' });
      }
    }

    // 3. Check duplicate leave
    const existing = await Leave.findOne({
      leaveType,
      date,
      ...(leaveType === 'staff' ? { staffId } : {})
    });

    if (existing) {
      return res.status(400).json({ message: 'A leave of this type on this date is already scheduled.' });
    }

    // 4. Create leave
    const addedByModel = req.role === 'admin' ? 'Admin' : 'Staff';
    const status = req.role === 'admin' ? 'approved' : 'pending';
    const leave = await Leave.create({
      leaveType,
      staffId: leaveType === 'staff' ? staffId : undefined,
      date,
      reason: reason || '',
      addedBy: req.user._id,
      addedByModel,
      status
    });

    const populated = await Leave.findById(leave._id).populate('staffId', 'name email role');

    // Notify connected clients via Socket
    const io = req.app.get('socketio');
    if (io) {
      const msg = leaveType === 'clinic'
        ? `Clinic-wide leave scheduled on ${date}.`
        : status === 'pending'
          ? `New leave request submitted on ${date} by ${populated.staffId.name} (Pending Approval).`
          : `Doctor/Staff leave scheduled on ${date} for ${populated.staffId.name}.`;

      io.emit('leaveUpdate', {
        action: 'create',
        leave: populated,
        message: msg
      });

      const targetRole = status === 'pending' ? 'admin' : 'all';
      await triggerNotification(msg, 'leave', targetRole, io);
    }

    res.status(201).json({ message: 'Leave successfully logged.', leave: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a leave
// @route   DELETE /api/leaves/:id
// @access  Private
export const deleteLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ message: 'Leave record not found.' });
    }

    const isAdmin = req.role === 'admin';
    const isSelf = leave.staffId && req.user && req.user._id.toString() === leave.staffId.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Access denied: You cannot delete this leave.' });
    }

    const leaveId = leave._id;
    await leave.deleteOne();

    // Notify connected clients via Socket
    const io = req.app.get('socketio');
    if (io) {
      io.emit('leaveUpdate', {
        action: 'delete',
        leaveId,
        message: 'A leave schedule was cancelled.'
      });
      await triggerNotification('A leave schedule was cancelled.', 'leave', 'all', io);
    }

    res.json({ message: 'Leave cancelled / removed successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve or reject a staff leave request
// @route   PATCH /api/leaves/:id/status
// @access  Private (Admin only)
export const updateLeaveStatus = async (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'

  try {
    if (req.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin permissions required.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be approved or rejected.' });
    }

    const leave = await Leave.findById(req.params.id).populate('staffId', 'name email role');
    if (!leave) {
      return res.status(404).json({ message: 'Leave record not found.' });
    }

    leave.status = status;
    await leave.save();

    // Notify connected clients via Socket
    const io = req.app.get('socketio');
    if (io) {
      const msg = `Leave request for ${leave.staffId ? leave.staffId.name : 'Staff'} on ${leave.date} has been ${status.toUpperCase()} by Admin.`;
      io.emit('leaveUpdate', {
        action: 'statusUpdate',
        leave,
        message: msg
      });
      await triggerNotification(msg, 'leave', 'all', io);
    }

    res.json({ message: `Leave request has been ${status}.`, leave });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get own leaves (for logged-in staff member)
// @route   GET /api/leaves/my
// @access  Private (Staff)
export const getMyLeaves = async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = { leaveType: 'staff', staffId: req.user._id };

    if (month && year) {
      const prefix = `${year}-${month.toString().padStart(2, '0')}`;
      query.date = { $regex: `^${prefix}` };
    }

    const leaves = await Leave.find(query)
      .populate('staffId', 'name email role')
      .sort({ date: -1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
