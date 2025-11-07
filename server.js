
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const twilio = require('twilio');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*", // or your frontend domain if you want it restricted
    methods: ["GET", "POST"]
  }
});


// ✅ Middleware
app.use(cors());
app.use(express.static('public'));

// ✅ Twilio Credentials
const accountSid = process.env.accountSid;
const authToken = process.env.authToken;
const client = twilio(accountSid, authToken);

// ✅ Endpoint for dynamic TURN credentials
app.get('/turn-credentials', async (req, res) => {
  try {
    const token = await client.tokens.create({ ttl: 3600 }); // valid for 1 hour
    res.json(token.iceServers);
  } catch (error) {
    console.error('Error fetching TURN credentials:', error.message);
    res.status(500).json({ error: 'Failed to get TURN credentials' });
  }
});

// ✅ Queue for users waiting to be matched
const waitingUsers = new Set();
// ✅ Map to track current pairs
const activePairs = new Map();

io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  // Find match request
  socket.on('find-match', () => {
    leaveCurrentPair(socket);

    if (waitingUsers.size > 0) {
      const matchedUser = waitingUsers.values().next().value;
      waitingUsers.delete(matchedUser);

      const pair = new Set([socket.id, matchedUser]);
      activePairs.set(socket.id, pair);
      activePairs.set(matchedUser, pair);

      io.to(matchedUser).emit('matched', socket.id);
      socket.emit('matched', matchedUser);
    } else {
      waitingUsers.add(socket.id);
    }
  });

  // Chat messages
  socket.on('chat-message', ({ message, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) {
      io.to(peerId).emit('chat-message', message);
    }
  });

  // WebRTC signaling
  socket.on('offer', ({ offer, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) {
      io.to(peerId).emit('offer', { offer, peerId: socket.id });
    }
  });

  socket.on('answer', ({ answer, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) {
      io.to(peerId).emit('answer', { answer, peerId: socket.id });
    }
  });

  socket.on('candidate', ({ candidate, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) {
      io.to(peerId).emit('candidate', { candidate, peerId: socket.id });
    }
  });

  // User leaves chat
  socket.on('leave-chat', () => {
    leaveCurrentPair(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
    leaveCurrentPair(socket);
    waitingUsers.delete(socket.id);
  });
});

// ✅ Helper for leaving current pair
function leaveCurrentPair(socket) {
  const pair = activePairs.get(socket.id);
  if (pair) {
    for (const userId of pair) {
      if (userId !== socket.id) {
        io.to(userId).emit('peer-left');
      }
      activePairs.delete(userId);
    }
  }
}

// ✅ Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
