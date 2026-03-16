'use strict';

// ── In-memory game state ──────────────────────────────────────────────────────
//
// rooms[roomCode] = {
//   players:        [ { id: socketId, name: string }, ... ],  // max 2
//   round:          number,    // starts at 1, increments each round
//   phase:          string,    // 'waiting' | 'answering' | 'reveal' | 'gameover'
//   currentPrompt:  string,    // the prompt shown to both players this round
//   answers:        [null|string, null|string],  // indexed by playerIndex
//   nextRoundVotes: Set,       // socket IDs that clicked "Next Round"
//   playAgainVotes: Set,       // socket IDs that clicked "Play Again"
//   matchCount:     number,    // how many rounds both players matched this game
//   settings:       { totalRounds: number, category: string },  // category id, e.g. 'food' or 'all'
// }
//
const rooms = {};

/**
 * Generates a unique 5-character room code using unambiguous characters
 * (no 0/O, 1/I/L so it's easy to read aloud or type on mobile).
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(
      { length: 5 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms[code]); // retry on the rare collision
  return code;
}

/**
 * Returns the room object for the given socket, or null if not in a room.
 */
function getRoomForSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms[code] : null;
}

module.exports = { rooms, generateRoomCode, getRoomForSocket };
