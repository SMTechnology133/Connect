// =========================
//  CONNECT CHAT SERVER
// =========================

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 5e7,       // allow large files
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "public"))); // your index.html is inside /public

// =========================
//   ACTIVE USERS
// =========================
const users = {}; // socketId → { name, avatar }

// =========================
//   SOCKET CONNECTION
// =========================
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Immediately send current users list (sender included)
    io.to(socket.id).emit("users-list", users);

    // -----------------------
    // JOIN
    // -----------------------
    socket.on("join", (user) => {
        users[socket.id] = {
            name: user.name || "User",
            avatar: user.avatar || null
        };

        // Notify others
        socket.broadcast.emit("user-joined", {
            id: socket.id,
            user: users[socket.id]
        });

        // Update whole list for all
        io.emit("users-list", users);
    });

    // -----------------------
    // PROFILE UPDATE
    // -----------------------
    socket.on("update-profile", (data) => {
        if (!users[socket.id]) return;

        users[socket.id].name = data.name || users[socket.id].name;
        users[socket.id].avatar = data.avatar || null;

        io.emit("profile-updated", {
            id: socket.id,
            user: users[socket.id]
        });
    });

    // -----------------------
    // TEXT MESSAGE
    // -----------------------
    socket.on("chat-message", (msg) => {
        // Broadcast to everyone except sender
        socket.broadcast.emit("chat-message", msg);
    });

    // -----------------------
    // FILE MESSAGE
    // -----------------------
    socket.on("file-message", (payload) => {
        // Broadcast to everyone except uploader
        socket.broadcast.emit("file-message", payload);
    });

    // -----------------------
    // TYPING
    // -----------------------
    socket.on("typing", () => {
        if (!users[socket.id]) return;
        socket.broadcast.emit("typing", { user: users[socket.id] });
    });

    socket.on("stop-typing", () => {
        socket.broadcast.emit("stop-typing");
    });

    // -----------------------
    // READ RECEIPTS
    // -----------------------
    socket.on("message-read", (data) => {
        // data = { msgId, reader, ts }
        // Forward ONLY to others
        socket.broadcast.emit("message-read", data);
    });

    // -----------------------
    // DISCONNECT
    // -----------------------
    socket.on("disconnect", () => {
        if (users[socket.id]) {
            io.emit("user-left", {
                id: socket.id,
                user: users[socket.id]
            });
            delete users[socket.id];
            io.emit("users-list", users);
        }
    });
});

// =========================
//   START SERVER
// =========================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("CONNECT chat server running on port", PORT);
});