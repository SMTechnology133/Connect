const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 }); // allow larger binary

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('join', (user) => {
    socket.data.user = user;
    socket.broadcast.emit('user-joined', { id: socket.id, user });
  });

  socket.on('typing', (payload) => {
    socket.broadcast.emit('typing', { id: socket.id, user: socket.data.user, ...payload });
  });

  socket.on('stop-typing', (payload) => {
    socket.broadcast.emit('stop-typing', { id: socket.id, user: socket.data.user, ...payload });
  });

  socket.on('chat-message', (msg) => {
    // msg: { id, sender, text, ts }
    socket.broadcast.emit('chat-message', msg);
  });

  socket.on('file-message', (payload) => {
    // payload: { id, fileName, fileType, fileId, arrayBuffer (binary) }
    // broadcast binary-capable event
    socket.broadcast.emit('file-message', payload);
  });

  socket.on('message-read', (payload) => {
    // payload: { messageId, reader }
    socket.broadcast.emit('message-read', payload);
  });

  socket.on('disconnect', (reason) => {
    socket.broadcast.emit('user-left', { id: socket.id, user: socket.data.user });
    console.log('disconnect', socket.id);
  });
});

server.listen(PORT, () => console.log('Server running on port', PORT));
