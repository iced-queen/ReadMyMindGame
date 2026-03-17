'use strict';

const { rooms, generateRoomCode, getRoomForSocket } = require('./rooms');
const { VALID_CATEGORY_IDS, pickPrompt } = require('./prompts');

// ── Fuzzy answer matching ────────────────────────────────────────────────────
//
// Uses Jaro-Winkler similarity so that near-matches like "color"/"colour" or
// "theater"/"theatre" are counted as correct.  Returns true when the two
// normalised strings are similar enough to be considered the same answer.
//
const MATCH_THRESHOLD = 0.85;

function jaroWinkler(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;

  const matchDist = Math.max(Math.floor(Math.max(la, lb) / 2) - 1, 0);
  const matchedA  = new Array(la).fill(false);
  const matchedB  = new Array(lb).fill(false);
  let matches = 0;

  for (let i = 0; i < la; i++) {
    const start = Math.max(0, i - matchDist);
    const end   = Math.min(i + matchDist + 1, lb);
    for (let j = start; j < end; j++) {
      if (matchedB[j] || a[i] !== b[j]) continue;
      matchedA[i] = matchedB[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0, transpositions = 0;
  for (let i = 0; i < la; i++) {
    if (!matchedA[i]) continue;
    while (!matchedB[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro = (matches / la + matches / lb + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, la, lb); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function answersMatch(a, b) {
  return jaroWinkler(a, b) >= MATCH_THRESHOLD;
}

/**
 * Registers all Socket.IO game event handlers on the given server instance.
 * @param {import('socket.io').Server} io
 */
function registerHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[connect]    ${socket.id}`);

    // ── create-room ────────────────────────────────────────────────────────────
    socket.on('create-room', ({ playerName, settings }) => {
      if (!playerName || typeof playerName !== 'string') return;
      const name = playerName.trim().slice(0, 20);
      if (!name) return;

      // Validate totalRounds from the settings, fall back to 6 if invalid.
      const totalRounds = (settings && Number.isInteger(settings.totalRounds)
        && settings.totalRounds >= 1 && settings.totalRounds <= 20)
        ? settings.totalRounds : 6;

      // Validate category; fall back to 'all' if unrecognised.
      const category = (settings && VALID_CATEGORY_IDS.includes(settings.category))
        ? settings.category : 'all';

      const roomCode = generateRoomCode();

      rooms[roomCode] = {
        players:        [{ id: socket.id, name }],
        round:          1,
        phase:          'waiting',     // waiting for the second player to join
        currentPrompt:  null,
        answers:        [null, null],  // one slot per player
        nextRoundVotes: new Set(),
        playAgainVotes: new Set(),
        matchCount:     0,
        settings:       { totalRounds, category },
      };

      socket.join(roomCode);
      socket.data.roomCode    = roomCode;
      socket.data.playerName  = name;
      socket.data.playerIndex = 0;

      socket.emit('room-created', { roomCode, playerIndex: 0 });
      console.log(`[room]       ${roomCode} created by "${name}"`);
    });

    // ── join-room ─────────────────────────────────────────────────────────────
    socket.on('join-room', ({ roomCode, playerName }) => {
      if (!playerName || !roomCode) return;
      const name = playerName.trim().slice(0, 20);
      const code = roomCode.trim().toUpperCase().slice(0, 5);
      if (!name || code.length !== 5) return;

      const room = rooms[code];

      if (!room) {
        socket.emit('error-message', 'Room not found. Double-check the code and try again.');
        return;
      }
      if (room.players.length >= 2) {
        socket.emit('error-message', 'This room is already full.');
        return;
      }
      if (room.phase !== 'waiting') {
        socket.emit('error-message', 'This game has already started.');
        return;
      }

      room.players.push({ id: socket.id, name });
      socket.join(code);
      socket.data.roomCode    = code;
      socket.data.playerName  = name;
      socket.data.playerIndex = 1;

      socket.emit('joined-room', { roomCode: code, playerIndex: 1 });

      // Both players are here — pick a prompt and start round 1.
      room.phase         = 'answering';
      room.currentPrompt = pickPrompt(room.settings.category);
      room.answers       = [null, null];

      io.to(code).emit('game-start', {
        players:     room.players.map(p => p.name),
        round:       room.round,
        prompt:      room.currentPrompt,
        matchCount:  room.matchCount,
        totalRounds: room.settings.totalRounds,
        category:    room.settings.category,
      });
      console.log(`[room]       ${code} started: "${room.players[0].name}" vs "${room.players[1].name}"`);
    });

    // ── submit-answer ─────────────────────────────────────────────────────────
    //
    // Each player submits one answer per round.
    // The server stores it and waits until both players have answered.
    // When both answers are in, it compares them (case-insensitive, trimmed)
    // and broadcasts the result to both players.
    //
    socket.on('submit-answer', ({ answer }) => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'answering') return;

      if (typeof answer !== 'string') return;
      const cleaned = answer.trim().slice(0, 100);
      if (!cleaned) return;

      const idx = socket.data.playerIndex;

      // Don't allow a player to overwrite their answer once it's submitted.
      if (room.answers[idx] !== null) return;

      room.answers[idx] = cleaned;

      // Check if both players have now answered.
      if (room.answers[0] !== null && room.answers[1] !== null) {
        room.phase = 'reveal';

        // Normalise then fuzzy-compare (Jaro-Winkler) so that near-matches
        // like "color"/"colour" or "theater"/"theatre" count as a match.
        const norm0   = room.answers[0].trim().toLowerCase();
        const norm1   = room.answers[1].trim().toLowerCase();
        const matched = answersMatch(norm0, norm1);

        // Increment the shared match counter when both players think the same thing.
        if (matched) room.matchCount++;

        const resultPayload = {
          answers:     [...room.answers],
          matched,
          players:     room.players.map(p => p.name),
          matchCount:  room.matchCount,
          round:       room.round,
          totalRounds: room.settings.totalRounds,
          prompt:      room.currentPrompt,
        };
        room.lastResult = resultPayload;
        io.to(socket.data.roomCode).emit('both-answered', resultPayload);
        console.log(`[room]       ${socket.data.roomCode} round ${room.round} — ${matched ? 'MATCH ✓' : 'no match ✗'}`);
      }
      // If only one answer is in, the client already shows a waiting state,
      // so no additional event is needed here.
    });

    // ── next-round ────────────────────────────────────────────────────────────
    // Both players must click "Next Round" before the game advances.
    socket.on('next-round', () => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'reveal') return;

      room.nextRoundVotes.add(socket.id);

      if (room.nextRoundVotes.size >= 2) {
        room.nextRoundVotes.clear();

        if (room.round >= room.settings.totalRounds) {
          // All rounds played — report the final match tally.
          room.phase          = 'gameover';
          room.playAgainVotes = new Set();

          io.to(socket.data.roomCode).emit('game-over', {
            matchCount:  room.matchCount,
            totalRounds: room.settings.totalRounds,
          });
          console.log(`[room]       ${socket.data.roomCode} — game over`);
        } else {
          // Advance to the next round with a fresh prompt.
          room.round++;
          room.phase         = 'answering';
          room.currentPrompt = pickPrompt(room.settings.category);
          room.answers       = [null, null];

          io.to(socket.data.roomCode).emit('game-start', {
            players:     room.players.map(p => p.name),
            round:       room.round,
            prompt:      room.currentPrompt,
            matchCount:  room.matchCount,
            totalRounds: room.settings.totalRounds,
            category:    room.settings.category,
          });
          console.log(`[room]       ${socket.data.roomCode} — round ${room.round} starting`);
        }
      } else {
        // First player to click — tell them to wait, and notify the other player.
        socket.emit('waiting-for-next-round');
        socket.to(socket.data.roomCode).emit('opponent-ready');
      }
    });

    // ── play-again ────────────────────────────────────────────────────────────
    socket.on('play-again', () => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'gameover') return;

      room.playAgainVotes.add(socket.id);

      if (room.playAgainVotes.size >= 2) {
        room.playAgainVotes.clear();

        // Reset everything and start a new game from round 1.
        room.round         = 1;
        room.matchCount    = 0;
        room.phase         = 'answering';
        room.currentPrompt = pickPrompt(room.settings.category);
        room.answers       = [null, null];

        io.to(socket.data.roomCode).emit('game-start', {
          players:     room.players.map(p => p.name),
          round:       room.round,
          prompt:      room.currentPrompt,
          matchCount:  room.matchCount,
          totalRounds: room.settings.totalRounds,
          category:    room.settings.category,
        });
        console.log(`[room]       ${socket.data.roomCode} — play again, round 1 starting`);
      } else {
        socket.emit('play-again-waiting');
        socket.to(socket.data.roomCode).emit('opponent-play-again');
      }
    });

    // ── rejoin-room ─────────────────────────────────────────────────
    socket.on('rejoin-room', ({ roomCode, playerIndex }) => {
      if (typeof roomCode !== 'string' || typeof playerIndex !== 'number') return;
      const code = roomCode.trim().toUpperCase().slice(0, 5);
      const room = rooms[code];

      if (!room) {
        socket.emit('error-message', 'Your session expired. Please start a new game.');
        return;
      }

      const slot = room.disconnectSlot;
      if (!slot || slot.playerIndex !== playerIndex) return;

      // Cancel the destruction timer
      clearTimeout(room.disconnectTimer);
      room.disconnectSlot  = null;
      room.disconnectTimer = null;

      // Restore socket data and room membership
      socket.join(code);
      socket.data.roomCode    = code;
      socket.data.playerName  = slot.playerName;
      socket.data.playerIndex = slot.playerIndex;
      if (room.players[slot.playerIndex]) room.players[slot.playerIndex].id = socket.id;

      // Notify the other player
      socket.to(code).emit('opponent-reconnected', { name: slot.playerName });

      // Acknowledge reconnection first (hides the overlay on the rejoining client)
      socket.emit('rejoined');

      // Restore client state based on current game phase
      const basePayload = {
        players:     room.players.map(p => p.name),
        round:       room.round,
        prompt:      room.currentPrompt,
        matchCount:  room.matchCount,
        totalRounds: room.settings.totalRounds,
        category:    room.settings.category,
      };

      switch (room.phase) {
        case 'answering':
          socket.emit('game-start', basePayload);
          break;
        case 'reveal':
          if (room.lastResult) socket.emit('both-answered', room.lastResult);
          else                  socket.emit('game-start', basePayload);
          break;
        case 'gameover':
          socket.emit('game-over', {
            matchCount:  room.matchCount,
            totalRounds: room.settings.totalRounds,
          });
          break;
        default:
          socket.emit('game-start', basePayload);
      }

      console.log(`[rejoin]     "${slot.playerName}" rejoined room ${code}`);
    });

    // ── disconnect ─────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const code        = socket.data.roomCode;
      const playerName  = socket.data.playerName;
      const playerIndex = socket.data.playerIndex;

      if (!code || !rooms[code]) {
        console.log(`[disconnect] ${socket.id}`);
        return;
      }

      const room = rooms[code];

      // Clean up any lingering votes from this socket
      room.nextRoundVotes?.delete(socket.id);
      room.playAgainVotes?.delete(socket.id);

      // No grace period before the game starts or after it ends
      if (room.players.length < 2 || room.phase === 'waiting' || room.phase === 'gameover') {
        io.to(code).emit('player-disconnected', { name: playerName });
        delete rooms[code];
        console.log(`[disconnect] ${socket.id} — room ${code} closed immediately`);
        return;
      }

      // If the other player is already in a grace period, both are gone — clean up now
      if (room.disconnectSlot) {
        clearTimeout(room.disconnectTimer);
        delete rooms[code];
        console.log(`[disconnect] ${socket.id} — room ${code} closed (both disconnected)`);
        return;
      }

      // Start the 15-second grace period
      if (room.players[playerIndex]) room.players[playerIndex].id = null;
      room.disconnectSlot = { playerIndex, playerName };

      // Immediately notify the remaining player
      io.to(code).emit('opponent-disconnected', { name: playerName });

      room.disconnectTimer = setTimeout(() => {
        if (rooms[code]) {
          io.to(code).emit('player-disconnected', { name: playerName });
          delete rooms[code];
          console.log(`[room]       ${code} closed — "${playerName}" timed out`);
        }
      }, 15000);

      console.log(`[disconnect] ${socket.id} — grace period started for room ${code}`);
    });
  });
}

module.exports = { registerHandlers };
