const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: { origin: "*" }
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

/* socketId → {name, avatar} */
let users = {};

function broadcastUsers() {
    io.emit("users-list", users);
}

io.on("connection", socket => {
    console.log("connected:", socket.id);

    // send current users to the new client
    socket.emit("users-list", users);

    /* JOIN */
    socket.on("join", ({ name, avatar }) => {
        const safeName = (name && typeof name === "string") ? name : `User-${Math.floor(Math.random()*10000)}`;
        socket.data.user = { name: safeName, avatar: avatar || null };
        users[socket.id] = socket.data.user;

        socket.broadcast.emit("user-joined", {
            id: socket.id,
            user: socket.data.user
        });

        broadcastUsers();
        console.log(`join: ${socket.id} -> ${safeName}`);
    });

    /* UPDATE PROFILE */
    socket.on("update-profile", ({ name, avatar }) => {
        const safeName = (name && typeof name === "string") ? name : socket.data.user?.name || `User-${Math.floor(Math.random()*10000)}`;
        socket.data.user = { name: safeName, avatar: avatar || null };
        users[socket.id] = socket.data.user;

        io.emit("profile-updated", {
            id: socket.id,
            user: socket.data.user
        });

        broadcastUsers();
    });

    /* TYPING */
    socket.on("typing", () => {
        if(socket.data.user) socket.broadcast.emit("typing", { user: socket.data.user });
    });

    socket.on("stop-typing", () => {
        socket.broadcast.emit("stop-typing");
    });

    /* TEXT MESSAGE */
    socket.on("chat-message", msg => {
        // don't trust client timestamps fully, but forward message
        socket.broadcast.emit("chat-message", msg);
    });

    /* FILE MESSAGE */
    socket.on("file-message", payload => {
        // socket.io handles binary payloads; just forward
        socket.broadcast.emit("file-message", payload);
    });

    /* READ RECEIPTS */
    socket.on("message-read", data => {
        socket.broadcast.emit("message-read", data);
    });

    /* DISCONNECT */
    socket.on("disconnect", () => {
        socket.broadcast.emit("user-left", {
            id: socket.id,
            user: socket.data.user || { name: "Unknown", avatar: null }
        });

        delete users[socket.id];
        broadcastUsers();
        console.log("disconnected:", socket.id);
    });
});

server.listen(PORT, () =>
    console.log("Server running on", PORT)
);