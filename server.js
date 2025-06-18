// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "https://telemedicine-app-lake.vercel.app");
    res.header("Access-Control-Allow-Methods", "GET,POST");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
});
app.use(cors({
    origin: "https://telemedicine-app-lake.vercel.app",
    methods: ["GET", "POST"],
    credentials: true
}));



// Serve static files - ensure this path is correct
const staticPath = path.join(__dirname, '../client/build');
if (require('fs').existsSync(staticPath)) {
    app.use(express.static(staticPath));
} else {
    console.warn('React build folder not found at:', staticPath);
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://telemedicine-app-lake.vercel.app",
        methods: ["GET", "POST"],
        credentials: true
    }
});

const rooms = {};



io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Patient creates a room
    socket.on('create-room', (roomId) => {
        rooms[roomId] = { patients: new Set([socket.id]), doctors: new Set() };
        socket.join(roomId);
        console.log(`Room ${roomId} created by patient ${socket.id}`);
        socket.emit('room-created', roomId);
    });

    // Doctor joins a room
    socket.on('join-room', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].doctors.add(socket.id);
            socket.join(roomId);
            console.log(`Doctor ${socket.id} joined room ${roomId}`);
            io.to(roomId).emit('doctor-joined', socket.id);
        } else {
            socket.emit('room-not-found');
        }
    });

    // WebRTC signaling
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', data.candidate);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Clean up rooms
        for (const roomId in rooms) {
            if (rooms[roomId].patients.has(socket.id)) {
                rooms[roomId].patients.delete(socket.id);
                if (rooms[roomId].patients.size === 0 && rooms[roomId].doctors.size === 0) {
                    delete rooms[roomId];
                }
            }
            if (rooms[roomId].doctors.has(socket.id)) {
                rooms[roomId].doctors.delete(socket.id);
                io.to(roomId).emit('doctor-left');
                if (rooms[roomId].patients.size === 0 && rooms[roomId].doctors.size === 0) {
                    delete rooms[roomId];
                }
            }
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));