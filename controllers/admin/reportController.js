import Token from '../../models/Token.js';
import Staff from '../../models/Staff.js';

// Helper to calculate date differences in minutes
const diffMinutes = (d1, d2) => {
  if (!d1 || !d2) return 0;
  return Math.max(0, Math.round((new Date(d1) - new Date(d2)) / 60000));
};

// @desc    Get dashboard summary statistics (Today's Overview)
// @route   GET /api/reports/dashboard-summary
// @access  Private (Admin / Staff)
export const getDashboardSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Find today's tokens
    const tokens = await Token.find({ date: today });

    const totalIssued = tokens.length;
    const served = tokens.filter((t) => t.status === 'completed' || t.status === 'serving').length;
    const skipped = tokens.filter((t) => t.status === 'skipped').length;
    const waiting = tokens.filter((t) => t.status === 'waiting').length;

    // Daily estimated revenue
    // Calculate total completed/serving tokens * consultation fee
    const dailyRevenue = tokens
      .filter((t) => t.status === 'completed' || t.status === 'serving')
      .reduce((sum, t) => sum + (t.consultationFee || 200), 0);

    res.json({
      totalIssued,
      served,
      skipped,
      waiting,
      dailyRevenue,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get comprehensive reports filtered by date range
// @route   GET /api/reports/analytics
// @access  Private (Admin only)
export const getAnalytics = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Please specify both startDate and endDate (YYYY-MM-DD).' });
    }

    // Query tokens within date range
    const tokens = await Token.find({
      date: { $gte: startDate, $lte: endDate },
    }).populate('doctor', 'name specializations');

    const total = tokens.length;
    const completed = tokens.filter((t) => t.status === 'completed');
    const skipped = tokens.filter((t) => t.status === 'skipped');
    const waiting = tokens.filter((t) => t.status === 'waiting');
    const serving = tokens.filter((t) => t.status === 'serving');

    // 1. Avg Wait Time (Check-in to Serve Start)
    let totalWaitTime = 0;
    let waitCount = 0;
    tokens.forEach((t) => {
      if (t.startTime) {
        totalWaitTime += diffMinutes(t.startTime, t.checkInTime);
        waitCount++;
      }
    });
    const avgWaitTime = waitCount > 0 ? Math.round(totalWaitTime / waitCount) : 0;

    // 2. Skip Rate
    const skipRate = total > 0 ? Math.round((skipped.length / total) * 100) : 0;

    // 3. Peak Hour Analysis (00:00 to 23:00)
    const hourlyCounts = Array(24).fill(0);
    tokens.forEach((t) => {
      if (t.checkInTime) {
        const hour = new Date(t.checkInTime).getHours();
        hourlyCounts[hour]++;
      }
    });

    const peakHours = hourlyCounts.map((count, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      count,
    }));

    // 4. Doctor-wise Performance
    const doctorStatsMap = {};
    const doctors = await Staff.find({ role: 'doctor' }).select('name');
    
    // Initialize map
    doctors.forEach((d) => {
      doctorStatsMap[d._id.toString()] = {
        name: d.name,
        totalPatients: 0,
        completedPatients: 0,
        skippedPatients: 0,
        totalConsultationTime: 0,
        avgConsultationTime: 0,
      };
    });

    tokens.forEach((t) => {
      const docId = t.doctor?._id?.toString() || t.doctor?.toString();
      if (docId && doctorStatsMap[docId]) {
        doctorStatsMap[docId].totalPatients++;
        if (t.status === 'completed') {
          doctorStatsMap[docId].completedPatients++;
          if (t.startTime && t.endTime) {
            doctorStatsMap[docId].totalConsultationTime += diffMinutes(t.endTime, t.startTime);
          }
        } else if (t.status === 'skipped') {
          doctorStatsMap[docId].skippedPatients++;
        }
      }
    });

    const doctorWiseReport = Object.values(doctorStatsMap).map((stats) => {
      stats.avgConsultationTime =
        stats.completedPatients > 0
          ? Math.round(stats.totalConsultationTime / stats.completedPatients)
          : 0;
      return stats;
    });

    // 5. Daily Trend Analysis (Weekly/Monthly views)
    const trendMap = {};
    tokens.forEach((t) => {
      if (!trendMap[t.date]) {
        trendMap[t.date] = { date: t.date, total: 0, completed: 0, skipped: 0 };
      }
      trendMap[t.date].total++;
      if (t.status === 'completed') trendMap[t.date].completed++;
      if (t.status === 'skipped') trendMap[t.date].skipped++;
    });

    const trendReport = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      summary: {
        totalPatients: total,
        completed: completed.length,
        skipped: skipped.length,
        waiting: waiting.length,
        serving: serving.length,
        avgWaitTime,
        skipRate,
      },
      peakHours,
      doctorWiseReport,
      trendReport,
      rawTokens: tokens,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
