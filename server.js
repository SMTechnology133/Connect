const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
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
    socket.broadcast.emit('chat-message', msg);
  });

  socket.on('file-message', (payload) => {
    socket.broadcast.emit('file-message', payload);
  });

  socket.on('message-read', (payload) => {
    socket.broadcast.emit('message-read', payload);
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('user-left', { id: socket.id, user: socket.data.user });
    console.log('disconnect', socket.id);
  });
});

server.listen(PORT, () => console.log('Server running on port', PORT));