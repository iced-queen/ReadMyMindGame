// state
const socket = io();

let myPlayerIndex    = -1;   // 0 = first player (creator), 1 = second player (joiner)
let myRoomCode       = null;
let currentRound     = 1;
let totalRounds      = 6;
let playerNames      = [];   // [player0Name, player1Name]
let matchCount       = 0;    // running match count
let selectedCategory = 'all'; // category id chosen in settings
let roundHistory     = [];   // [{ round, prompt, answers, players, matched }]

// keep in sync with src/prompts.js
const CATEGORIES = [
  { id: 'all',           label: 'All Categories',  emoji: '🎲' },
  { id: 'food',          label: 'Food & Drink',    emoji: '🍕' },
  { id: 'nature',        label: 'Nature & Science',emoji: '🌍' },
  { id: 'entertainment', label: 'Entertainment',   emoji: '🎬' },
  { id: 'sports',        label: 'Sports & Games',  emoji: '⚽' },
  { id: 'everyday',      label: 'Everyday Life',   emoji: '🏠' },
  { id: 'spicy',         label: 'Spicy',           emoji: '🌶️' },
  { id: 'random',        label: 'Random & Fun',    emoji: '✨' },
];

// fill in the category buttons
(function buildCategoryGrid() {
  const grid = document.getElementById('category-grid');
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type       = 'button';
    btn.className  = 'category-pill' + (cat.id === 'all' ? ' active' : '');
    btn.dataset.id = cat.id;
    btn.innerHTML  = `<span class="cat-emoji">${cat.emoji}</span><span class="cat-label">${cat.label}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = cat.id;
    });
    grid.appendChild(btn);
  });
})();

// match rating
function getMatchRating(matched, total) {
  const ratio = matched / total;
  if (ratio === 1)  return { title: 'Telepathic! 🔮',     desc: 'A perfect score — you two are on another level.' };
  if (ratio >= 0.8) return { title: 'Mind Readers! 🧠',   desc: 'Almost perfect — incredible sync.' };
  if (ratio >= 0.6) return { title: 'In Sync! 👯',        desc: 'You think alike more often than not.' };
  if (ratio >= 0.4) return { title: 'Getting There 👍',   desc: 'Some good moments of connection.' };
  if (ratio >= 0.2) return { title: 'Not Quite 😅',       desc: "A few sparks, but the minds didn't quite meet." };
  return                    { title: 'Total Strangers 😶', desc: 'You two think very differently — better luck next time!' };
}

// lobby

// go to settings first
document.getElementById('create-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  showScreen('screen-room-settings');
});

// send settings to server
document.getElementById('confirm-create-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  if (!roundsInput.checkValidity() || roundsInput.value === '') {
    roundsInput.reportValidity();
    return;
  }
  socket.emit('create-room', { playerName: name, settings: { totalRounds: roundsSetting, category: selectedCategory } });
});

document.getElementById('back-to-lobby-settings-btn').addEventListener('click', () => {
  showScreen('screen-lobby');
});

// look up the code
document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name) { alert('Please enter your name.'); return; }
  if (code.length !== 5) { alert('Please enter a valid 5-character room code.'); return; }
  socket.emit('join-room', { roomCode: code, playerName: name });
});

// enter key triggers join
document.getElementById('room-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('join-btn').click();
});

// rounds stepper

let roundsSetting = 6;
const roundsInput = document.getElementById('rounds-display');

function clampRounds(val) { return Math.max(1, Math.min(20, val)); }

document.getElementById('rounds-dec').addEventListener('click', () => {
  roundsSetting = clampRounds(roundsSetting - 1);
  roundsInput.value = roundsSetting;
});

document.getElementById('rounds-inc').addEventListener('click', () => {
  roundsSetting = clampRounds(roundsSetting + 1);
  roundsInput.value = roundsSetting;
});

roundsInput.addEventListener('input', () => {
  const val = parseInt(roundsInput.value, 10);
  if (!isNaN(val)) roundsSetting = clampRounds(val);
});

roundsInput.addEventListener('blur', () => {
  // snap back if blank or invalid
  roundsSetting = clampRounds(
    isNaN(parseInt(roundsInput.value, 10)) ? 6 : parseInt(roundsInput.value, 10)
  );
  roundsInput.value = roundsSetting;
});

// socket events

// room created, show the code
socket.on('room-created', ({ roomCode, playerIndex }) => {
  myPlayerIndex = playerIndex;
  myRoomCode    = roomCode;
  const roomCodeEl = document.getElementById('display-room-code');
  roomCodeEl.textContent = roomCode;
  roomCodeEl.onclick = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      roomCodeEl.classList.add('copied');
      setTimeout(() => roomCodeEl.classList.remove('copied'), 2000);
    });
  };
  // show chosen category
  const cat = CATEGORIES.find(c => c.id === selectedCategory);
  document.getElementById('waiting-room-category').textContent =
    cat ? `${cat.emoji}\u00a0${cat.label}` : '';
  showScreen('screen-waiting-room');
});

// game-start fires right after this
socket.on('joined-room', ({ roomCode, playerIndex }) => {
  myPlayerIndex = playerIndex;
  myRoomCode    = roomCode;
});

// runs at the start of every round
socket.on('game-start', ({ players, round, prompt, matchCount: mc, totalRounds: t, category }) => {
  currentRound = round;
  playerNames  = players;
  totalRounds  = t;
  matchCount   = mc;
  if (round === 1) roundHistory = [];

  document.getElementById('opponent-banner').classList.add('hidden');

  // shrink the header during play
  document.querySelector('header').classList.add('compact');

  // category badge
  const cat = CATEGORIES.find(c => c.id === category);
  const catBadge = document.getElementById('category-badge');
  if (catBadge && cat) catBadge.textContent = `${cat.emoji}\u00a0${cat.label}`;

  // fill in round info
  const roundLabel = `Round ${round} / ${totalRounds}`;
  document.getElementById('answering-round').textContent = roundLabel;
  document.getElementById('prompt-display').textContent  = prompt;

  // clear input for new round
  const input = document.getElementById('answer-input');
  input.value    = '';
  input.disabled = false;

  const submitBtn = document.getElementById('submit-answer-btn');
  submitBtn.disabled    = false;
  submitBtn.textContent = 'Submit Answer';
  submitBtn.classList.remove('sent');

  showScreen('screen-answering');
});

// both players answered, show results
socket.on('both-answered', ({ answers, matched, players, matchCount: mc, round, totalRounds: t, prompt }) => {
  matchCount = mc;
  roundHistory.push({ round, prompt, answers: [...answers], players: [...players], matched });

  document.getElementById('match-count-display').textContent = matchCount;
  document.getElementById('match-total-display').textContent = t;

  // animate result heading
  const heading   = matched ? '🧠 Match!' : '😬 No Match';
  const headingEl = document.getElementById('result-heading');
  headingEl.textContent = heading;
  headingEl.classList.remove('pop', 'match', 'no-match');
  void headingEl.offsetWidth; // force a reflow so the animation restarts
  headingEl.classList.add(matched ? 'match' : 'no-match', 'pop');

  document.getElementById('results-round').textContent = `Round ${round} / ${t}`;

  // show prompt
  const resultPromptBox  = document.getElementById('result-prompt-box');
  const resultPromptText = document.getElementById('result-prompt-text');
  if (prompt) {
    resultPromptText.textContent = prompt;
    resultPromptBox.style.display = '';
  } else {
    resultPromptBox.style.display = 'none';
  }

  buildAnswerCompare(answers, players, matched);

  // next button
  const nextBtn = document.getElementById('next-round-btn');
  nextBtn.disabled    = false;
  nextBtn.textContent = round >= t ? 'Finish Game →' : 'Next Round →';
  nextBtn.classList.remove('pulse');

  // clear ready status
  document.getElementById('ready-name-me').textContent   = playerNames[myPlayerIndex];
  document.getElementById('ready-name-them').textContent = playerNames[1 - myPlayerIndex];
  document.getElementById('ready-pill-me').classList.remove('is-ready');
  document.getElementById('ready-pill-them').classList.remove('is-ready');

  showScreen('screen-results');
});

// we clicked next, waiting on them
socket.on('waiting-for-next-round', () => {
  const btn = document.getElementById('next-round-btn');
  btn.disabled    = true;
  btn.textContent = 'Waiting…';
  btn.classList.remove('pulse');
  document.getElementById('ready-pill-me').classList.add('is-ready');
});

// they already clicked next
socket.on('opponent-ready', () => {
  document.getElementById('ready-pill-them').classList.add('is-ready');
  // nudge them to click
  const btn = document.getElementById('next-round-btn');
  if (!btn.disabled) btn.classList.add('pulse');
});

// all rounds finished
socket.on('game-over', ({ matchCount: final, totalRounds: t }) => {
  document.querySelector('header').classList.remove('compact');

  const rating = getMatchRating(final, t);
  document.getElementById('gameover-heading').textContent = rating.title;
  document.getElementById('gameover-detail').textContent  = rating.desc;

  // final score
  document.getElementById('final-match-display').innerHTML =
    `<div class="final-match-fraction">
      <span class="final-match-num">${final}</span>
      <span class="final-match-sep">/</span>
      <span class="final-match-den">${t}</span>
    </div>
    <p class="final-match-label">You matched ${final} out of ${t} round${t !== 1 ? 's' : ''}</p>`;

  // round history
  const scroll = document.getElementById('game-summary-scroll');
  scroll.innerHTML = '';
  roundHistory.forEach(entry => {
    const row = document.createElement('div');
    row.className = `summary-row ${entry.matched ? 'summary-match' : 'summary-no-match'}`;

    const header = document.createElement('div');
    header.className = 'summary-row-header';

    const roundLbl = document.createElement('span');
    roundLbl.className   = 'summary-round-label';
    roundLbl.textContent = `Round ${entry.round}`;

    const badge = document.createElement('span');
    badge.className   = `summary-badge ${entry.matched ? 'match' : 'no-match'}`;
    badge.textContent = entry.matched ? '✓ Match' : '✗ No Match';

    header.appendChild(roundLbl);
    header.appendChild(badge);

    const promptEl = document.createElement('p');
    promptEl.className   = 'summary-prompt';
    promptEl.textContent = entry.prompt;

    const answersEl = document.createElement('div');
    answersEl.className = 'summary-answers';
    entry.players.forEach((name, i) => {
      const ansRow = document.createElement('div');
      ansRow.className = 'summary-answer-row';

      const nameLbl = document.createElement('span');
      nameLbl.className   = 'summary-answer-name';
      nameLbl.textContent = name;

      const ansText = document.createElement('span');
      ansText.className   = 'summary-answer-text';
      ansText.textContent = `"${entry.answers[i]}"`;

      ansRow.appendChild(nameLbl);
      ansRow.appendChild(ansText);
      answersEl.appendChild(ansRow);
    });

    row.appendChild(header);
    row.appendChild(promptEl);
    row.appendChild(answersEl);
    scroll.appendChild(row);
  });

  const playBtn = document.getElementById('play-again-btn');
  playBtn.disabled    = false;
  playBtn.textContent = 'Play Again';
  playBtn.classList.remove('pulse');

  document.getElementById('play-again-name-me').textContent   = playerNames[myPlayerIndex];
  document.getElementById('play-again-name-them').textContent = playerNames[1 - myPlayerIndex];
  document.getElementById('play-again-pill-me').classList.remove('is-ready');
  document.getElementById('play-again-pill-them').classList.remove('is-ready');

  showScreen('screen-game-over');
});

// we clicked play again, waiting on them
socket.on('play-again-waiting', () => {
  const btn = document.getElementById('play-again-btn');
  btn.disabled    = true;
  btn.textContent = 'Waiting…';
  btn.classList.remove('pulse');
  document.getElementById('play-again-pill-me').classList.add('is-ready');
});

// they want to play again
socket.on('opponent-play-again', () => {
  document.getElementById('play-again-pill-them').classList.add('is-ready');
  const btn = document.getElementById('play-again-btn');
  if (!btn.disabled) btn.classList.add('pulse');
});

// room closed after disconnect
socket.on('player-disconnected', ({ name }) => {
  document.getElementById('opponent-banner').classList.add('hidden');
  showError(`${name} disconnected. The game has ended.`);
});

// join error
socket.on('error-message', message => {
  showError(message);
});

// submit answer

document.getElementById('submit-answer-btn').addEventListener('click', () => {
  const answer = document.getElementById('answer-input').value.trim();
  if (!answer) { alert('Please type an answer first.'); return; }

  // lock in and show waiting screen
  socket.emit('submit-answer', { answer });

  setWaiting(
    'Answer locked in! 🔒',
    'Waiting for the other player to submit their answer…'
  );
  document.getElementById('waiting-round').textContent = `Round ${currentRound} / ${totalRounds}`;
  showScreen('screen-waiting');
});

// enter to submit
document.getElementById('answer-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('submit-answer-btn').click();
});

// next round

document.getElementById('next-round-btn').addEventListener('click', () => {
  socket.emit('next-round');
});

// play again

document.getElementById('play-again-btn').addEventListener('click', () => {
  socket.emit('play-again');
});

// error screen

document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
  location.reload();
});

// reconnection

socket.on('disconnect', () => {
  if (myPlayerIndex !== -1) {
    document.getElementById('connection-overlay').classList.remove('hidden');
  }
});

socket.on('connect', () => {
  if (myPlayerIndex !== -1 && myRoomCode) {
    socket.emit('rejoin-room', { roomCode: myRoomCode, playerIndex: myPlayerIndex });
  }
});

socket.on('rejoined', () => {
  document.getElementById('connection-overlay').classList.add('hidden');
});

socket.on('opponent-disconnected', ({ name }) => {
  document.getElementById('opponent-banner-text').textContent =
    `${name} disconnected — waiting for them to reconnect…`;
  document.getElementById('opponent-banner').classList.remove('hidden');
});

socket.on('opponent-reconnected', () => {
  document.getElementById('opponent-banner').classList.add('hidden');
});
