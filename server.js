const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// allow large binary payloads (files)
const io = new Server(server, { 
  maxHttpBufferSize: 1e8,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the same directory
app.use(express.static(__dirname));

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;

// In-memory users map: socketId -> { name, avatar }
const users = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Immediately send current users list to the connecting client
  socket.emit('users-list', users);

  socket.on('join', (userObj) => {
    // Expect userObj = { name: 'Alice', avatar: 'data:image/png;base64,...' } or avatar null
    if (!userObj || typeof userObj !== 'object') {
      userObj = { name: 'Anonymous', avatar: null };
    }
    
    socket.data.user = userObj;
    users[socket.id] = userObj;

    // Notify everyone (including the new socket)
    io.emit('users-list', users);
    socket.broadcast.emit('user-joined', { id: socket.id, user: userObj });

    console.log('User joined:', socket.id, userObj.name);
  });

  socket.on('typing', (payload) => {
    const userName = socket.data.user ? socket.data.user.name : 'Anonymous';
    socket.broadcast.emit('typing', { 
      user: userName, 
      userObj: socket.data.user 
    });
  });

  socket.on('stop-typing', (payload) => {
    const userName = socket.data.user ? socket.data.user.name : 'Anonymous';
    socket.broadcast.emit('stop-typing', { 
      user: userName, 
      userObj: socket.data.user 
    });
  });

  socket.on('chat-message', (msg) => {
    // Add senderObj to message if not present
    if (!msg.senderObj && socket.data.user) {
      msg.senderObj = socket.data.user;
    }
    socket.broadcast.emit('chat-message', msg);
  });

  socket.on('file-message', (payload) => {
    // Add senderObj to payload if not present
    if (!payload.senderObj && socket.data.user) {
      payload.senderObj = socket.data.user;
    }
    socket.broadcast.emit('file-message', payload);
  });

  socket.on('message-read', (payload) => {
    socket.broadcast.emit('message-read', payload);
  });

  socket.on('disconnect', () => {
    // notify others
    const leftUser = users[socket.id];
    delete users[socket.id];
    socket.broadcast.emit('user-left', { id: socket.id, user: leftUser });
    io.emit('users-list', users);
    console.log('User disconnected:', socket.id, leftUser && leftUser.name);
  });
});

server.listen(PORT, () => console.log('Server running on port', PORT));