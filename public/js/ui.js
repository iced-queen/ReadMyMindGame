// screen management
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// fill in the waiting screen
function setWaiting(heading, subtext) {
  document.getElementById('waiting-heading').textContent = heading;
  document.getElementById('waiting-subtext').textContent = subtext;
}

// show error
function showError(message) {
  document.getElementById('error-msg-text').textContent = message;
  showScreen('screen-error');
}

// html escape
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// build answer rows
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
