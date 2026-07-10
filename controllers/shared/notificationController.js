import Notification from '../../models/Notification.js';

// @desc    Get user notifications (filtered by role and mapped with read status)
// @route   GET /api/notifications
// @access  Private (Admin, Staff, Patient)
export const getNotifications = async (req, res) => {
  try {
    const userRole = req.role || 'patient';
    const userIdStr = req.user._id.toString();

    // Query notifications targetable for this user's role or 'all'
    const notifications = await Notification.find({
      role: { $in: ['all', userRole] }
    }).sort({ createdAt: -1 }).limit(50);

    const formatted = notifications.map(notif => ({
      id: notif._id,
      text: notif.text,
      type: notif.type,
      timestamp: notif.createdAt,
      read: notif.readBy.includes(userIdStr),
      role: notif.role
    }));

    res.json({ notifications: formatted });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark all role-relevant notifications as read for current user
// @route   POST /api/notifications/read
// @access  Private (Admin, Staff, Patient)
export const markAllNotificationsRead = async (req, res) => {
  try {
    const userRole = req.role || 'patient';
    const userIdStr = req.user._id.toString();

    const notifications = await Notification.find({
      role: { $in: ['all', userRole] }
    });

    for (const notif of notifications) {
      if (!notif.readBy.includes(userIdStr)) {
        notif.readBy.push(userIdStr);
        await notif.save();
      }
    }

    res.json({ message: 'Notifications marked as read successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Utility function to save to DB and dispatch socket notifications
export const triggerNotification = async (text, type, role, io) => {
  try {
    const notif = await Notification.create({
      text,
      type,
      role
    });

    if (io) {
      io.emit('newNotification', {
        id: notif._id,
        text: notif.text,
        type: notif.type,
        role: notif.role,
        timestamp: notif.createdAt,
        read: false
      });
    }
    return notif;
  } catch (err) {
    console.error('Error triggering notification:', err.message);
  }
};
