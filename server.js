const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  maxHttpBufferSize: 1e8,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const users = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.emit('users-list', users);

  socket.on('join', (userObj) => {
    if (!userObj || typeof userObj !== 'object') {
      userObj = { name: 'Anonymous', avatar: null };
    }
    
    socket.data.user = userObj;
    users[socket.id] = userObj;

    io.emit('users-list', users);
    socket.broadcast.emit('user-joined', { id: socket.id, user: userObj });
    console.log('User joined:', socket.id, userObj.name);
  });

  socket.on('typing', () => {
    const userName = socket.data.user ? socket.data.user.name : 'Anonymous';
    socket.broadcast.emit('typing', { user: userName });
  });

  socket.on('stop-typing', () => {
    const userName = socket.data.user ? socket.data.user.name : 'Anonymous';
    socket.broadcast.emit('stop-typing', { user: userName });
  });

  socket.on('chat-message', (msg) => {
    if (!msg.senderObj && socket.data.user) {
      msg.senderObj = socket.data.user;
    }
    socket.broadcast.emit('chat-message', msg);
  });

  socket.on('file-message', (payload) => {
    if (!payload.senderObj && socket.data.user) {
      payload.senderObj = socket.data.user;
    }
    socket.broadcast.emit('file-message', payload);
  });

  socket.on('disconnect', () => {
    const leftUser = users[socket.id];
    delete users[socket.id];
    socket.broadcast.emit('user-left', { id: socket.id, user: leftUser });
    io.emit('users-list', users);
    console.log('User disconnected:', socket.id, leftUser?.name);
  });
});

server.listen(PORT, () => console.log('Server running on port', PORT));