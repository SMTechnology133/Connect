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

/* in-memory messages array (server lifetime only). Keep cap to avoid blow-up */
const MESSAGES = [];
const MESSAGES_MAX = 2000;

// read receipt dedupe store: key -> timestamp
// key format: `${messageId}|${reader}`
const READ_DEDUPE = new Map();
const READ_DEDUPE_TTL_MS = 30 * 1000; // ignore duplicate read receipts for 30s

// sanitize helper
function sanitize(s){
    if(!s || typeof s !== "string") return s || "";
    return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

function broadcastUsers() {
    io.emit("users-list", users);
}

// cleanup old entries in READ_DEDUPE periodically
setInterval(() => {
    const now = Date.now();
    for(const [k, t] of READ_DEDUPE.entries()){
        if(now - t > READ_DEDUPE_TTL_MS) READ_DEDUPE.delete(k);
    }
}, 10 * 1000);

io.on("connection", socket => {
    console.log("connected:", socket.id);

    // send current users and history (server memory) to the new client
    socket.emit("users-list", users);
    socket.emit("history", MESSAGES.slice());

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
        if(!msg) return;
        msg.sender = sanitize(msg.sender);
        msg.text = sanitize(msg.text);
        msg.ts = msg.ts || Date.now();

        // store in memory (lightweight)
        MESSAGES.push(msg);
        if(MESSAGES.length > MESSAGES_MAX) MESSAGES.shift();

        // forward
        socket.broadcast.emit("chat-message", msg);
    });

    /* FILE MESSAGE */
    socket.on("file-message", payload => {
        if(!payload) return;
        payload.sender = sanitize(payload.sender);
        payload.fileName = sanitize(payload.fileName);
        payload.ts = payload.ts || Date.now();

        // store a lightweight record (not the binary)
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

        // forward entire payload (socket.io will handle binary / arraybuffer)
        socket.broadcast.emit("file-message", payload);
    });

    /* READ RECEIPTS */
    socket.on("message-read", data => {
        if(!data || !data.messageId) return;
        // sanitize
        const reader = sanitize(data.reader || "Someone");
        const messageId = String(data.messageId);
        const key = `${messageId}|${reader}`;

        const now = Date.now();
        const last = READ_DEDUPE.get(key) || 0;
        // if we've seen the same reader/message within TTL, ignore
        if(now - last < READ_DEDUPE_TTL_MS){
            return;
        }
        // store timestamp and broadcast
        READ_DEDUPE.set(key, now);

        const out = {
            messageId,
            reader,
            avatar: data.avatar || null,
            ts: data.ts || now
        };

        // broadcast to others (not back to sender)
        socket.broadcast.emit("message-read", out);
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