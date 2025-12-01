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

/* in-memory messages array (server lifetime only).
   This allows clients who reconnect while the server runs to fetch messages they missed.
   We keep a cap to avoid memory blow-up.
*/
const MESSAGES = [];
const MESSAGES_MAX = 2000;

// sanitize text to remove control chars (prevents replacement char �)
function sanitize(s){
    if(!s || typeof s !== "string") return s || "";
    return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

function broadcastUsers() {
    io.emit("users-list", users);
}

io.on("connection", socket => {
    console.log("connected:", socket.id);

    // send current users and in-memory history to the connecting client
    socket.emit("users-list", users);
    socket.emit("history", MESSAGES.slice()); // shallow copy

    /* JOIN */
    socket.on("join", ({ name, avatar }) => {
        const safeName = sanitize(name) || `User-${Math.floor(Math.random()*10000)}`;
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
        const safeName = sanitize(name) || socket.data.user?.name || `User-${Math.floor(Math.random()*10000)}`;
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
        // sanitize
        if(msg){
            msg.sender = sanitize(msg.sender);
            msg.text = sanitize(msg.text);
            msg.ts = msg.ts || Date.now();
            // store in memory
            MESSAGES.push(msg);
            if(MESSAGES.length > MESSAGES_MAX) MESSAGES.shift();
            // forward to others
            socket.broadcast.emit("chat-message", msg);
        }
    });

    /* FILE MESSAGE */
    socket.on("file-message", payload => {
        if(!payload) return;
        // sanitize sender & filename
        payload.sender = sanitize(payload.sender);
        payload.fileName = sanitize(payload.fileName);
        payload.ts = payload.ts || Date.now();

        // store a lightweight message record in memory (not the binary)
        const msgRec = {
            id: payload.id,
            sender: payload.sender,
            avatar: payload.avatar || null,
            fileId: payload.fileId,
            fileName: payload.fileName,
            fileType: payload.fileType,
            ts: payload.ts
        };
        MESSAGES.push(msgRec);
        if(MESSAGES.length > MESSAGES_MAX) MESSAGES.shift();

        // forward the entire payload (including binary arrayBuffer) to other clients
        socket.broadcast.emit("file-message", payload);
    });

    /* READ RECEIPTS */
    socket.on("message-read", data => {
        // sanitize
        if(data){
            data.reader = sanitize(data.reader);
            data.ts = data.ts || Date.now();
            socket.broadcast.emit("message-read", data);
        }
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