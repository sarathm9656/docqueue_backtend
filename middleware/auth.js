import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Staff from '../models/Staff.js';
import Patient from '../models/Patient.js';

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');

      // Check if Admin
      let user = await Admin.findById(decoded.id).select('-password');
      if (user) {
        if (user.sessionVersion && decoded.sessionVersion !== user.sessionVersion) {
          return res.status(401).json({ message: 'Session invalidated: logged in on another device' });
        }
        req.user = user;
        req.role = 'admin';
        return next();
      }

      // Check if Staff
      user = await Staff.findById(decoded.id).select('-password');
      if (user) {
        if (user.sessionVersion && decoded.sessionVersion !== user.sessionVersion) {
          return res.status(401).json({ message: 'Session invalidated: logged in on another device' });
        }
        req.user = user;
        req.role = user.role;
        return next();
      }

      return res.status(401).json({ message: 'Not authorized, user not found' });
    } catch (error) {
      console.error('Auth verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Admin only' });
  }
};

export const patientProtect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');

      const patient = await Patient.findById(decoded.id);
      if (!patient) {
        return res.status(401).json({ message: 'Patient account not found' });
      }

      req.patient = patient;
      return next();
    } catch (error) {
      console.error('Patient auth verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const anyUserProtect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');

      // Check if Admin
      let user = await Admin.findById(decoded.id).select('-password');
      if (user) {
        req.user = user;
        req.role = 'admin';
        return next();
      }

      // Check if Staff
      user = await Staff.findById(decoded.id).select('-password');
      if (user) {
        req.user = user;
        req.role = user.role;
        return next();
      }

      // Check if Patient
      const patient = await Patient.findById(decoded.id);
      if (patient) {
        req.user = patient;
        req.role = 'patient';
        return next();
      }

      return res.status(401).json({ message: 'Not authorized, user not found' });
    } catch (error) {
      console.error('Any user auth verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};
