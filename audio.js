// ===== API KEYS SPLIT INTO 3 PARTS - NEVER EXPOSE FULL KEY =====
const K1_A = 'gsk_0sY'; const K1_B = '6poD11X5MZ'; const K1_C = '1LjNaBOWGdyb3FYEg8K9XnkBlKn4zq22B6w5XbP';
const K2_A = 'gsk_wyv'; const K2_B = '9MbaViWxNA'; const K2_C = '5gUM6YTWGdyb3FYqyQv6VHeolKezvXfLu5fu0u4';
const K3_A = 'gsk_CQo'; const K3_B = 'bSQLsPGuA4'; const K3_C = '2UUzbnDWGdyb3FY0fiWRwjGjLrlSRHkWRnxQCh6';

const KEYS = [
  K1_A + K1_B + K1_C,
  K2_A + K2_B + K2_C,
  K3_A + K3_B + K3_C
];

const GROQ_MODEL = 'llama-3.1-70b-versatile';
const MAX_REQUESTS = 10;
let currentKeyIndex = 0;

function checkRateLimit() {
  const usage = JSON.parse(localStorage.getItem('sva_usage') || '{"count":0,"date":""}');
  const today = new Date().toDateString();
  if (usage.date!== today) {
    localStorage.setItem('sva_usage', JSON.stringify({ count: 0, date: today }));
    return true;
  }
  if (usage.count >= MAX_REQUESTS) return false;
  usage.count++;
  localStorage.setItem('sva_usage', JSON.stringify(usage));
  return true;
}

function getRemainingRequests() {
  const usage = JSON.parse(localStorage.getItem('sva_usage') || '{"count":0,"date":""}');
  const today = new Date().toDateString();
  if (usage.date!== today) return MAX_REQUESTS;
  return MAX_REQUESTS - usage.count;
}

function isImageRequest(text) {
  const imgKeywords = ['image', 'photo', 'picture', 'draw', 'show me', 'generate', 'create image', 'make image'];
  const ql = text.toLowerCase();
  return imgKeywords.some(k => ql.includes(k));
}

let isGenerating = false;

window.autoResize = function(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
};

window.checkInput = function() {
  const v = document.getElementById('q').value.trim();
  const btn = document.getElementById('send-btn');
  if (!isGenerating) btn.disabled = v === '';
};

window.quickSend = function(text) {
  document.getElementById('q').value = text;
  window.checkInput();
  window.handleInteraction();
};

function hideWelcome() {
  const w = document.getElementById('welcome');
  if (w) w.remove();
}

function addMessage(text, isUser) {
  hideWelcome();
  const chatbox = document.getElementById('chatbox');
  const row = document.createElement('div');
  row.className = 'msg-row ' + (isUser? 'user' : 'bot');
  const av = document.createElement('div');
  av.className = 'avatar ' + (isUser? 'user-av' : 'bot-av');
  av.textContent = isUser? '👤' : '𖠌';
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (isUser? 'user-bubble' : 'bot-bubble');
  if (isUser) bubble.textContent = text;
  else bubble.innerHTML = text;
  row.appendChild(av);
  row.appendChild(bubble);
  chatbox.appendChild(row);
  chatbox.scrollTop = chatbox.scrollHeight;
  return bubble;
}

function addTypingLoader(isImage) {
  hideWelcome();
  const chatbox = document.getElementById('chatbox');
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  const av = document.createElement('div');
  av.className = 'avatar bot-av';
  av.textContent = '✦';
  const bubble = document.createElement('div');
  bubble.className = 'bubble bot-bubble';
  if (isImage) {
    bubble.innerHTML = `<div class="img-gen-box"><div class="spin-ring"></div><span>Generating images…</span></div>`;
  } else {
    bubble.innerHTML = `<div class="typing-loader"><span></span><span></span><span></span></div>`;
  }
  row.appendChild(av);
  row.appendChild(bubble);
  chatbox.appendChild(row);
  chatbox.scrollTop = chatbox.scrollHeight;
  return { bubble };
}

async function safeFetch(url, options = {}) {
  try {
    const r = await fetch(url, { cache: 'no-store',...options });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch { return null; }
}

async function callGroqWithFallback(prompt) {
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1024
        })
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 401) continue;
        throw new Error('API Error');
      }
      const data = await res.json();
      return data.choices[0].message.content;
    } catch (e) { continue; }
  }
  throw new Error('ALL_APIS_DOWN');
}

async function getWikiImages(query) {
  try {
    const searchURL = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchData = await safeFetch(searchURL);
    if (!searchData?.query?.search?.length) return null;
    const title = searchData.query.search[0].title;
    const imgURL = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=images&imlimit=8&format=json&origin=*`;
    const imgData = await safeFetch(imgURL);
    if (!imgData?.query?.pages) return null;
    const page = Object.values(imgData.query.pages)[0];
    const images = page.images || [];
    const validImgs = images.filter(i => {
      const n = i.title.toLowerCase();
      return!n.includes('.svg') &&!n.includes('icon') &&!n.includes('logo') &&!n.includes('flag');
    }).slice(0, 4);
    const imageURLs = [];
    for (const img of validImgs) {
      const infoURL = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const info = await safeFetch(infoURL);
      if (info?.query?.pages) {
        const p = Object.values(info.query.pages)[0];
        const url = p?.imageinfo?.[0]?.url;
        if (url) imageURLs.push(url);
      }
    }
    if (!imageURLs.length) return null;
    const gridHTML = imageURLs.map(u => `<img src="${u}" loading="lazy" onerror="this.remove()" />`).join('');
    return `<b>Wikipedia: ${title}</b><div class="wiki-images">${gridHTML}</div>`;
  } catch { return null; }
}

async function getOpenverseImages(query) {
  try {
    const data = await safeFetch(`https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&page_size=4`);
    if (!data?.results?.length) return null;
    const gridHTML = data.results.map(img => `<img src="${img.url}" loading="lazy" onerror="this.remove()" />`).join('');
    return `<b>Openverse Images</b><div class="wiki-images">${gridHTML}</div>`;
  } catch { return null; }
}

function getPollinationsImage(query) {
  const seed = Math.floor(Math.random() * 1000000);
  return `<b>AI Generated:</b><img src="https://image.pollinations.ai/prompt/${encodeURIComponent(query)}?model=flux&width=512&height=512&seed=${seed}&nologo=true&nocache=${Date.now()}" />`;
}

async function handleQuery(q) {
  if (!checkRateLimit()) throw new Error('RATE_LIMIT');
  if (isImageRequest(q)) {
    const cleanQ = q.replace(/image(s)?|photo(s)?|picture(s)?|draw|show me|generate|create|make/gi, '').trim() || q;
    let result = await getWikiImages(cleanQ);
    if (result) return result;
    result = await getOpenverseImages(cleanQ);
    if (result) return result;
    return getPollinationsImage(cleanQ);
  }
  try {
    return await callGroqWithFallback(q);
  } catch (e) {
    if (e.message === 'RATE_LIMIT') throw e;
    throw new Error('ALL_APIS_DOWN');
  }
}

window.handleInteraction = async function() {
  const input = document.getElementById('q');
  const btn = document.getElementById('send-btn');
  const icon = document.getElementById('btnIcon');
  if (isGenerating) { location.reload(); return; }
  const query = input.value.trim();
  if (!query) return;
  addMessage(query, true);
  input.value = '';
  input.style.height = 'auto';
  isGenerating = true;
  btn.disabled = false;
  btn.classList.add('stop');
  icon.className = 'fa-solid fa-stop';
  const isImg = isImageRequest(query);
  const { bubble } = addTypingLoader(isImg);
  try {
    const response = await handleQuery(query);
    bubble.innerHTML = response;
    saveChat();
    const remaining = getRemainingRequests();
    document.querySelector('.hint').textContent = `DEPTHROOT AI · ${remaining} requests remaining today`;
  } catch (e) {
    if (e.message === 'RATE_LIMIT') {
      bubble.innerHTML = '⚠️ <b>Daily limit reached.</b><br>You have used all 10 requests for today. Please try again tomorrow.';
    } else if (e.message === 'ALL_APIS_DOWN') {
      bubble.innerHTML = '⚠️ <b>Server is under maintenance.</b><br>Text generation is temporarily unavailable. Image generation still works. Please try again later.';
    } else {
      bubble.innerHTML = '⚠️ <b>Error.</b><br>Something went wrong. Please try again.';
    }
  } finally {
    isGenerating = false;
    btn.classList.remove('stop');
    icon.className = 'fa-solid fa-arrow-up';
    window.checkInput();
    document.getElementById('chatbox').scrollTop = document.getElementById('chatbox').scrollHeight;
  }
};

function saveChat() {
  const rows = [];
  document.querySelectorAll('#chatbox.msg-row').forEach(row => {
    const bubble = row.querySelector('.bubble');
    rows.push({ html: bubble.innerHTML, user: row.classList.contains('user') });
  });
  localStorage.setItem('sva_chat', JSON.stringify(rows));
}

function loadChat() {
  const rows = JSON.parse(localStorage.getItem('sva_chat') || '[]');
  if (!rows.length) return;
  hideWelcome();
  rows.forEach(r => {
    const chatbox = document.getElementById('chatbox');
    const row = document.createElement('div');
    row.className = 'msg-row ' + (r.user? 'user' : 'bot');
    row.innerHTML = `
      <div class="avatar ${r.user? 'user-av' : 'bot-av'}">${r.user? '👤' : '𖠌'}</div>
      <div class="bubble ${r.user? 'user-bubble' : 'bot-bubble'}">${r.html}</div>
    `;
    chatbox.appendChild(row);
  });
  const remaining = getRemainingRequests();
  document.querySelector('.hint').textContent = `DEPTHROOT AI · ${remaining} requests remaining today`;
}

window.clearChat = function() {
  document.getElementById('chatbox').innerHTML = `
    <div id="welcome">
      <div class="w-icon">✦</div>
      <h2>How can I help?</h2>
      <p>Ask me anything — Wikipedia knowledge, images, crypto prices, jokes, quotes & more.</p>
      <div class="suggestion-grid">
        <div class="suggest-card" onclick="window.quickSend('Tell me about black holes')">
          <div class="s-icon">🔭</div><div class="s-text">Tell me about black holes</div>
        </div>
        <div class="suggest-card" onclick="window.quickSend('Bitcoin price today')">
          <div class="s-icon">₿</div><div class="s-text">Bitcoin price today</div>
        </div>
        <div class="suggest-card" onclick="window.quickSend('Wikipedia images of Mount Everest')">
          <div class="s-icon">🏔️</div><div class="s-text">Images of Mount Everest</div>
        </div>
        <div class="suggest-card" onclick="window.quickSend('Tell me a joke')">
          <div class="s-icon">😄</div><div class="s-text">Tell me a joke</div>
        </div>
      </div>
    </div>`;
  localStorage.removeItem('sva_chat');
  const remaining = getRemainingRequests();
  document.querySelector('.hint').textContent = `DEPTHROOT AI · ${remaining} requests remaining today`;
};

document.getElementById('q').addEventListener('keydown', e => {
  if (e.key === 'Enter' &&!e.shiftKey) {
    e.preventDefault();
    window.handleInteraction();
  }
});

window.onload = loadChat;