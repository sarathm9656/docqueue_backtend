import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import { seedAllData } from './utils/seeder.js';

// Routes
import authRoutes from './routes/shared/authRoutes.js';
import clinicRoutes from './routes/admin/clinicRoutes.js';
import roleRoutes from './routes/admin/roleRoutes.js';
import queueRoutes from './routes/shared/queueRoutes.js';
import reportRoutes from './routes/admin/reportRoutes.js';
import subscriptionRoutes from './routes/admin/subscriptionRoutes.js';
import leaveRoutes from './routes/shared/leaveRoutes.js';
import notificationRoutes from './routes/shared/notificationRoutes.js';
import medicineRoutes from './routes/shared/medicineRoutes.js';

dotenv.config();

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);

// Configure Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

app.set('socketio', io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/staff', roleRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/medicines', medicineRoutes);

// Root test endpoint
app.get('/', (req, res) => {
  res.send('Clinic Queue Management System API is running.');
});

seedAllData();

// Socket.io connections handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
