// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings for local development
const io = new Server(server, {
    cors: {
        origin: "*", // Allows all origins for simplicity in local testing
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// A simple structure to hold pending requests, mapped by Request ID
// This is crucial to track which User A socket needs the final response.
let pendingRequests = {};

// Helper function to generate a simple unique ID
const generateRequestId = () => {
    return Math.random().toString(36).substring(2, 9) + Date.now();
};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- 1. Handle Request from User A ---
    socket.on('newRequest', (requestText) => {
        const requestId = generateRequestId();
        const requestData = {
            id: requestId,
            text: requestText,
            requesterSocketId: socket.id // Store User A's socket ID
        };

        // Store the request data in memory
        pendingRequests[requestId] = requestData;

        console.log(`[Request: ${requestId}] New request from User A (${socket.id}): "${requestText}"`);

        // Send the request to ALL other connected clients (User B)
        // Use broadcast.emit to exclude the sender (User A)
        socket.broadcast.emit('requestReceived', requestData);
        
        // Notify User A that the request is pending
        socket.emit('requestPending', requestId);
    });

    // --- 3. Handle Response from User B ---
    socket.on('respondToRequest', ({ requestId, status }) => {
        const originalRequest = pendingRequests[requestId];

        if (!originalRequest) {
            console.error(`Request ID ${requestId} not found or already processed.`);
            return;
        }

        const requesterSocketId = originalRequest.requesterSocketId;

        console.log(`[Request: ${requestId}] Response from User B (${socket.id}): ${status}`);

        // --- 4. Send Response back to User A ---
        // Emit the response specifically to the original requester's socket ID
        io.to(requesterSocketId).emit('requestResponse', {
            id: requestId,
            status: status,
            responseText: originalRequest.text
        });

        // Clean up the pending request
        delete pendingRequests[requestId];
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        // Clean up any pending requests associated with the disconnected user
        for (const id in pendingRequests) {
            if (pendingRequests[id].requesterSocketId === socket.id) {
                delete pendingRequests[id];
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Open multiple browser tabs to simulate User A and User B.`);
});
