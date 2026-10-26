/* app.js - all front-end behaviour (no libraries needed) */

const $ = (sel) => document.querySelector(sel);
const chat = $('#chat'), form = $('#form'), input = $('#input'), sendBtn = $('#send');
const panel = $('#panel'), backdrop = $('#backdrop');

/* ---------- Helpers ---------- */

// Fetch wrapper: returns JSON or throws an Error with the server's message
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Escape text so it is safe to place inside HTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Tiny, safe markdown: ```code```, `inline`, **bold**, *italic*, bullet lists, paragraphs
function inlineMd(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}
function markdown(text) {
  return text.split('```').map((part, i) => {
    if (i % 2) return `<pre><code>${esc(part.replace(/^\w*\n/, ''))}</code></pre>`;
    let html = '', inList = false;
    for (const line of part.split('\n')) {
      const item = line.match(/^\s*[*-]\s+(.*)/);
      if (item) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inlineMd(item[1])}</li>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (line.trim()) html += `<p>${inlineMd(line)}</p>`;
      }
    }
    return html + (inList ? '</ul>' : '');
  }).join('');
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const scrollDown = () => chat.scrollTo({ top: chat.scrollHeight });

/* ---------- Messages ---------- */

function addMessage(role, content, seconds) {
  $('#welcome')?.remove();
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (role === 'bot') {
    bubble.innerHTML = markdown(content);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<span>⏱ ${seconds}s</span><button type="button">Copy</button>`;
    meta.querySelector('button').onclick = () =>
      navigator.clipboard.writeText(content).then(() => toast('Copied!'));
    bubble.appendChild(meta);
  } else {
    bubble.textContent = content;       // user/error text is never treated as HTML
  }
  wrap.appendChild(bubble);
  chat.appendChild(wrap);
  scrollDown();
  return wrap;
}

function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
  chat.appendChild(wrap);
  scrollDown();
  return wrap;
}

let busy = false;
async function sendMessage(text) {
  text = text.trim();
  if (!text || busy) return;

  // Typed slash commands work like the terminal version
  const commands = { '/history': 'history', '/stats': 'stats', '/charts': 'charts', '/models': 'models' };
  if (commands[text]) { input.value = ''; return openPanel(commands[text]); }
  if (text === '/reset') { input.value = ''; return resetChat(); }

  busy = true; sendBtn.disabled = true;
  addMessage('user', text);
  input.value = ''; autoGrow();
  const typing = showTyping();

  try {
    const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
    typing.remove();
    addMessage('bot', data.answer, data.seconds);
  } catch (err) {
    typing.remove();
    addMessage('bot error', err.message);
  } finally {
    busy = false; sendBtn.disabled = false; input.focus();
  }
}

async function resetChat() {
  try {
    await api('/api/reset', { method: 'POST' });
    chat.innerHTML = '';
    addWelcome();
    toast('New conversation started');
  } catch (err) { toast(err.message); }
}

function addWelcome() {
  chat.innerHTML = `
    <section class="welcome" id="welcome">
      <div class="logo big">✦</div>
      <h2>How can I help you today?</h2>
      <p>Ask me anything. I explain things in simple English.</p>
      <div class="chips">
        <button class="chip">What is a Python list?</button>
        <button class="chip">Explain photosynthesis simply</button>
        <button class="chip">Give me 3 study tips</button>
      </div>
    </section>`;
}

/* ---------- Side panel (history / stats / charts / models) ---------- */

function openPanel(kind) {
  const titles = { history: 'Recent chats', stats: 'Statistics', charts: 'Charts', models: 'Gemini models' };
  $('#panel-title').textContent = titles[kind];
  $('#panel-body').innerHTML = '<p class="muted">Loading…</p>';
  panel.classList.add('open'); backdrop.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  renderers[kind]().catch((err) => { $('#panel-body').innerHTML = `<p class="muted">${esc(err.message)}</p>`; });
}
function closePanel() {
  panel.classList.remove('open'); backdrop.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
}
const setBody = (html) => { $('#panel-body').innerHTML = html; };

const renderers = {
  async history() {
    const { rows, total } = await api('/api/history');
    if (!rows.length) return setBody('<p class="muted">No chats saved yet.</p>');
    const body = rows.reverse().map((r) =>
      `<tr><td>${esc(r.chat_no)}</td><td>${esc(r.question)}</td><td>${esc(r.response_time_sec)}s</td></tr>`).join('');
    setBody(`<table><thead><tr><th>#</th><th>Question</th><th>Time</th></tr></thead><tbody>${body}</tbody></table>
             <p class="note">Showing the last ${rows.length} of ${total} chats.</p>`);
  },

  async stats() {
    const s = await api('/api/stats');
    if (s.empty) return setBody('<p class="muted">No chats yet. Ask a question first!</p>');
    const card = (value, label) => `<div class="card"><b>${value}</b><span>${label}</span></div>`;
    setBody(`<div class="cards">
        ${card(s.total, 'Total chats')}
        ${card(s.avg_time + 's', 'Average response time')}
        ${card(s.median_time + 's', 'Median response time')}
        ${card(s.max_time + 's', 'Slowest response')}
        ${card(s.avg_answer_words, 'Avg answer (words)')}
        ${card(s.prediction ?? '—', 'Predicted words for a 10-word question')}
      </div>
      ${s.prediction === null ? '<p class="note">Prediction needs at least 3 chats with different question lengths.</p>' : ''}`);
  },

  async charts() {
    const { charts } = await api('/api/charts', { method: 'POST' });
    setBody(charts.map((src) => `<img class="chart-img" src="${src}" alt="Chat chart">`).join(''));
  },

  async models() {
    const { models } = await api('/api/models');
    setBody(models.length
      ? `<ul class="list">${models.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
      : '<p class="muted">No models found.</p>');
  },
};

/* ---------- Theme ---------- */

function applyTheme(theme) { document.documentElement.dataset.theme = theme; }
applyTheme(localStorage.getItem('theme') ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next); localStorage.setItem('theme', next);
};

/* ---------- Events ---------- */

function autoGrow() {                    // textarea grows with the text
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}
input.addEventListener('input', autoGrow);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});
form.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(input.value); });

chat.addEventListener('click', (e) => {          // suggestion chips
  if (e.target.classList.contains('chip')) sendMessage(e.target.textContent);
});
document.querySelectorAll('[data-panel]').forEach((btn) => {
  btn.onclick = () => openPanel(btn.dataset.panel);
});
$('#reset').onclick = resetChat;
$('#panel-close').onclick = closePanel;
backdrop.onclick = closePanel;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

input.focus();
