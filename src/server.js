/**
 * server.js — ReadMyMind entry point
 *
 * Sets up Express, creates the HTTP + Socket.IO server, and starts listening.
 * Room state lives in rooms.js; socket event logic lives in socketHandlers.js.
 */

'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const { registerHandlers } = require('./socketHandlers');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// Serve everything in the /public folder as static files.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Register all Socket.IO game event handlers.
registerHandlers(io);

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\nReadMyMind is running → http://localhost:${PORT}\n`);
});
