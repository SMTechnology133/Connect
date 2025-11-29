// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// allow large binary payloads (files) if needed
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// Serve static files with UTF-8 headers
app.use(express.static("public", {
    setHeaders: (res, path) => {
        if (path.endsWith(".html")) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
        }
        if (path.endsWith(".css")) {
            res.setHeader("Content-Type", "text/css; charset=utf-8");
        }
        if (path.endsWith(".js")) {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        }
        if (path.endsWith(".json")) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
        }
    }
}));

const PORT = process.env.PORT || 3000;

// In-memory users map: socketId -> { name, avatar }
const users = {};

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  // Immediately send current users list to the connecting client
  socket.emit('users-list', users);

  socket.on('join', (userObj) => {
    // Expect userObj = { name: 'Alice', avatar: 'data:image/png;base64,...' } or avatar null
    socket.data.user = userObj || { name: 'Anonymous', avatar: null };
    users[socket.id] = socket.data.user;

    // Notify everyone (including the new socket)
    io.emit('users-list', users);
    socket.broadcast.emit('user-joined', { id: socket.id, user: socket.data.user });

    console.log('user joined', socket.id, socket.data.user && socket.data.user.name);
  });

  socket.on('typing', (payload) => {
    socket.broadcast.emit('typing', { id: socket.id, user: socket.data.user ? socket.data.user.name : null, userObj: socket.data.user, ...payload });
  });

  socket.on('stop-typing', (payload) => {
    socket.broadcast.emit('stop-typing', { id: socket.id, user: socket.data.user ? socket.data.user.name : null, userObj: socket.data.user, ...payload });
  });

  socket.on('chat-message', (msg) => {
    // msg should include senderObj if client provided it; broadcast unchanged
    socket.broadcast.emit('chat-message', msg);
  });

  socket.on('file-message', (payload) => {
    // payload expected to contain arrayBuffer or base64 (clients handle storing)
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
    console.log('disconnect', socket.id, leftUser && leftUser.name);
  });
});

server.listen(PORT, () => console.log('Server running on port', PORT));