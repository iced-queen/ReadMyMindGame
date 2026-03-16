// ── Screen management ─────────────────────────────────────────────────────────
//
// Only one screen is visible at a time.
// Call showScreen('screen-id') to switch to a different screen.
//
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Updates the heading and subtext on the generic waiting screen.
function setWaiting(heading, subtext) {
  document.getElementById('waiting-heading').textContent = heading;
  document.getElementById('waiting-subtext').textContent = subtext;
}

// Switches to the error screen with a custom message.
function showError(message) {
  document.getElementById('error-msg-text').textContent = message;
  showScreen('screen-error');
}

// Escapes HTML special characters to safely insert user content into innerHTML.
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Builds the answer comparison section on the results screen.
// Shows each player's answer in a row — green if they matched, neutral if not.
function buildAnswerCompare(answers, players, matched) {
  const container = document.getElementById('answer-compare');
  container.innerHTML = '';

  players.forEach((name, i) => {
    const row = document.createElement('div');
    row.className          = `answer-row ${matched ? 'answer-match' : 'answer-no-match'}`;
    row.style.animationDelay = `${i * 0.12}s`;

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'answer-player-name';
    nameSpan.textContent = name;

    const textSpan = document.createElement('span');
    textSpan.className   = 'answer-text';
    textSpan.textContent = `"${answers[i]}"`;

    row.appendChild(nameSpan);
    row.appendChild(textSpan);
    container.appendChild(row);
  });
}
