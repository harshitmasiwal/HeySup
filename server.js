const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const waitingUsers = new Set();
const activePairs = new Map();

io.on('connection', socket => {
  console.log('User connected:', socket.id);

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

  socket.on('chat-message', ({ message, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) io.to(peerId).emit('chat-message', message);
  });

  socket.on('offer', ({ offer, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) io.to(peerId).emit('offer', { offer, peerId: socket.id });
  });

  socket.on('answer', ({ answer, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) io.to(peerId).emit('answer', { answer, peerId: socket.id });
  });

  socket.on('candidate', ({ candidate, peerId }) => {
    const pair = activePairs.get(socket.id);
    if (pair && pair.has(peerId)) io.to(peerId).emit('candidate', { candidate, peerId: socket.id });
  });

  socket.on('leave-chat', () => leaveCurrentPair(socket));

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    leaveCurrentPair(socket);
    waitingUsers.delete(socket.id);
  });
});

function leaveCurrentPair(socket) {
  const pair = activePairs.get(socket.id);
  if (pair) {
    for (const userId of pair) {
      if (userId !== socket.id) io.to(userId).emit('peer-left');
      activePairs.delete(userId);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
