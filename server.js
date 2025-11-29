const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: { origin: "*" }
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

/* socketId → { name, avatar } */
let users = {};

function broadcastUsers() {
    io.emit("users-list", users);
}

io.on("connection", socket => {
    console.log("connected:", socket.id);

    socket.emit("users-list", users);

    /* JOIN */
    socket.on("join", ({name,avatar})=>{
        socket.data.user = { name, avatar };
        users[socket.id] = socket.data.user;

        socket.broadcast.emit("user-joined", {
            id: socket.id,
            user: socket.data.user
        });

        broadcastUsers();
    });

    /* PROFILE UPDATE */
    socket.on("update-profile", ({name,avatar})=>{
        socket.data.user = { name, avatar };
        users[socket.id] = socket.data.user;
        io.emit("profile-updated", { id: socket.id, user: socket.data.user });
        broadcastUsers();
    });

    /* TYPING */
    socket.on("typing", ()=>{
        socket.broadcast.emit("typing", { user: socket.data.user });
    });

    socket.on("stop-typing", ()=>{
        socket.broadcast.emit("stop-typing");
    });

    /* MESSAGES */
    socket.on("chat-message", msg=>{
        socket.broadcast.emit("chat-message", msg);
    });

    socket.on("file-message", payload=>{
        socket.broadcast.emit("file-message", payload);
    });

    socket.on("message-read", data=>{
        socket.broadcast.emit("message-read", data);
    });

    /* DISCONNECT */
    socket.on("disconnect",()=>{
        socket.broadcast.emit("user-left", {
            id: socket.id,
            user: socket.data.user || {name:"Unknown"}
        });
        delete users[socket.id];
        broadcastUsers();
    });
});

server.listen(PORT, ()=>console.log("Server running on", PORT));