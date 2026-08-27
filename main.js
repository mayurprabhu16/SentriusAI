const API_BASE_URL = '/api';

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { return null; }
}

let USER_ID = localStorage.getItem('sentrius_user_id');

const canvas = document.getElementById('matrix-canvas');
const ctx = canvas.getContext('2d');
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
let resizeTimeout;
window.addEventListener('resize', () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(resizeCanvas, 100); });
resizeCanvas();
const chars = '01XYZ789@#$%^&*()';
const fontSize = 14;
const columns = Math.floor(canvas.width / fontSize);
const drops = Array(columns).fill(1);
function drawMatrix() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff41'; ctx.font = fontSize + 'px monospace';
    for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) drops[i] = 0;
        drops[i]++;
    }
}
setInterval(drawMatrix, 50);

const views = { 
    intro: document.getElementById('intro-screen'), 
    chat: document.getElementById('chat-window'),
    news: document.getElementById('news-window'),
    header: document.querySelector('header.header'), 
    footer: document.querySelector('.input-footer') 
};

const sidebar = document.getElementById('sidebar');
const chatListEl = document.getElementById('chat-history-list');
const msgInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
let currentChatId = null;

// --- AUDIO SETUP (NEW) ---
const muteBtn = document.getElementById('mute-btn');
function updateMuteBtnText() {
    const muted = window.sentriusSounds.isMuted();
    muteBtn.innerText = muted ? '[AUDIO: OFF]' : '[AUDIO: ON]';
    muteBtn.classList.toggle('text-red-500', muted);
}
if (muteBtn) {
    updateMuteBtnText();
    muteBtn.addEventListener('click', () => {
        window.sentriusSounds.toggleMute();
        updateMuteBtnText();
    });
}

// Global click sound listener for UI elements
document.addEventListener('click', (e) => {
    if (e.target.closest('.cyber-btn') || e.target.closest('button') || e.target.closest('.chat-history-item')) {
        window.sentriusSounds.click();
    }
});
// -------------------------

// --- MODAL LOGIC (CONFIRM & INPUT) ---
let pendingConfirmAction = null;
const confirmModal = document.getElementById('confirmation-modal');

function showConfirm(title, message, action) {
    document.getElementById('confirm-title').innerText = `> ${title}`;
    document.getElementById('confirm-msg').innerText = message;
    pendingConfirmAction = action;
    confirmModal.classList.remove('hidden');
}
function hideConfirm() {
    confirmModal.classList.add('hidden');
    pendingConfirmAction = null;
}
document.getElementById('confirm-cancel-btn').addEventListener('click', hideConfirm);
document.getElementById('confirm-backdrop').addEventListener('click', hideConfirm);
document.getElementById('confirm-proceed-btn').addEventListener('click', () => {
    if (pendingConfirmAction) pendingConfirmAction();
    hideConfirm();
});

let pendingInputCallback = null;
const inputModal = document.getElementById('input-modal');
const inputField = document.getElementById('input-field');

function showInput(title, initialValue, callback) {
    document.getElementById('input-title').innerText = `> ${title}`;
    inputField.value = initialValue;
    pendingInputCallback = callback;
    inputModal.classList.remove('hidden');
    setTimeout(() => inputField.focus(), 50);
}
function hideInput() {
    inputModal.classList.add('hidden');
    pendingInputCallback = null;
}
document.getElementById('input-cancel-btn').addEventListener('click', hideInput);
document.getElementById('input-backdrop').addEventListener('click', hideInput);
document.getElementById('input-proceed-btn').addEventListener('click', () => {
    if (pendingInputCallback) pendingInputCallback(inputField.value);
    hideInput();
});
inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('input-proceed-btn').click();
    if (e.key === 'Escape') hideInput();
});
// -------------------------------------

function setView(viewName) {
    views.intro.classList.add('hidden');
    views.chat.classList.add('hidden');
    views.news.classList.add('hidden');
    if (views[viewName]) views[viewName].classList.remove('hidden');
    views.header.classList.toggle('hidden', viewName === 'intro');
    views.footer.classList.toggle('hidden', viewName !== 'chat');
    
    if (viewName === 'chat') {
        // MODIFIED: Check for user name and update welcome message
        const name = localStorage.getItem('sentrius_user_name');
        const welcomeSubtitle = document.getElementById('welcome-subtitle');
        if (welcomeSubtitle) {
            if (name) {
                // Sanitize the name to prevent basic HTML injection
                const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                welcomeSubtitle.innerHTML = `Welcome, ${safeName}.<br>Awaiting input...`;
            } else {
                welcomeSubtitle.innerHTML = `A CyberSecurity Chatbot<br>Awaiting input...`; // Default for guests
            }
        }
        setTimeout(() => scrollToBottom(true), 50);
    }
    
    if (viewName === 'news') loadNews();
}

function toggleSidebar() { sidebar.classList.toggle('open'); }
function closeSidebar() { sidebar.classList.remove('open'); }

function updateProfileUI() {
    const name = localStorage.getItem('sentrius_user_name');
    const pic = localStorage.getItem('sentrius_user_pic');
    const profileEl = document.getElementById('user-profile');
    if (name && pic && profileEl) {
        document.getElementById('user-name').innerText = name;
        document.getElementById('user-avatar').src = pic;
        profileEl.classList.remove('hidden');
    } else if (profileEl) {
        profileEl.classList.add('hidden');
    }
}

window.handleGoogleLogin = function(response) {
    const data = parseJwt(response.credential);
    if (data && data.sub) {
        USER_ID = `OP_${data.sub}`;
        localStorage.setItem('sentrius_user_id', USER_ID);
        localStorage.setItem('sentrius_user_name', data.name);
        localStorage.setItem('sentrius_user_pic', data.picture);
        window.sentriusSounds.success(); // PLAY SUCCESS SOUND
        const authContainer = document.getElementById('auth-container');
        if (authContainer) authContainer.innerHTML = '<div class="text-green-500 font-mono animate-pulse">[IDENTITY_VERIFIED] ACCESSING_WEBPAGE...</div>';
        setTimeout(() => { updateProfileUI(); setView('chat'); loadSidebarHistory(); }, 1500);
    } else {
        window.sentriusSounds.error(); // PLAY ERROR SOUND
        alert("AUTH_FAILURE: Could not verify Google identity credentials.");
    }
}

window.logout = function() {
    showConfirm('TERMINATE_SESSION?', 'Confirm disconnection from secure neural net. Local credentials will be deleted.', () => {
        window.sentriusSounds.error(); // PLAY "POWER DOWN" SOUND
        localStorage.removeItem('sentrius_user_id');
        localStorage.removeItem('sentrius_user_name');
        localStorage.removeItem('sentrius_user_pic');
        location.reload();
    });
}

async function loadSidebarHistory() {
    if (!USER_ID) return;
    try {
        const res = await fetch(`${API_BASE_URL}/chats`, { headers: { 'x-user-id': USER_ID } });
        if (!res.ok) throw new Error();
        const chats = await res.json();
        chatListEl.innerHTML = '';
        chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = `chat-history-item ${chat._id === currentChatId ? 'active' : ''}`;
            const titleSpan = document.createElement('span');
            titleSpan.className = 'truncate mr-2 flex-1 min-w-0';
            titleSpan.innerText = `> ${chat.title}`;
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'flex shrink-0 opacity-60 hover:opacity-100 transition-opacity';
            const renameBtn = document.createElement('button');
            renameBtn.className = 'text-blue-500 hover:text-blue-400 px-1.5 font-bold z-10';
            renameBtn.innerText = '[R]';
            renameBtn.onclick = (e) => { e.stopPropagation(); renameChat(chat._id, chat.title); };
            const delBtn = document.createElement('button');
            delBtn.className = 'text-red-500 hover:text-red-400 px-1.5 font-bold z-10';
            delBtn.innerText = '[X]';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteChat(chat._id); };
            actionsDiv.appendChild(renameBtn);
            actionsDiv.appendChild(delBtn);
            div.onclick = () => loadChatSession(chat._id);
            div.appendChild(titleSpan);
            div.appendChild(actionsDiv);
            chatListEl.appendChild(div);
        });
    } catch (e) { chatListEl.innerHTML = '<div class="text-red-500 text-xs p-4 opacity-70">[LOGS_OFFLINE]</div>'; }
}

async function renameChat(id, currentTitle) {
    showInput('RENAME_OPERATION', currentTitle, async (newTitle) => {
        if (!newTitle || newTitle.trim() === "" || newTitle === currentTitle) return;
        try {
            const res = await fetch(`${API_BASE_URL}/chats/${id}`, { 
                method: 'PATCH', 
                headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
                body: JSON.stringify({ title: newTitle.trim() })
            });
            if (!res.ok) throw new Error();
            loadSidebarHistory();
        } catch (e) { 
            window.sentriusSounds.error();
            alert("SYSTEM ERROR: Could not rename operation."); 
        }
    });
}

async function deleteChat(id) {
    showConfirm('DELETE_LOG?', 'This action will permanently erase all data for this operation. Cannot be undone.', async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/chats/${id}`, { method: 'DELETE', headers: { 'x-user-id': USER_ID } });
            if (!res.ok) throw new Error();
            if (currentChatId === id) { currentChatId = null; setView('intro'); }
            loadSidebarHistory();
        } catch (e) { 
            window.sentriusSounds.error();
            alert("ERROR: Could not delete log."); 
        }
    });
}

async function startNewSession() {
    if (!USER_ID) {
         USER_ID = 'GUEST_' + Math.random().toString(36).substring(2, 15);
         localStorage.setItem('sentrius_user_id', USER_ID);
    }
    try {
        const res = await fetch(`${API_BASE_URL}/chats`, { method: 'POST', headers: { 'x-user-id': USER_ID } });
        if (!res.ok) throw new Error();
        const chat = await res.json();
        currentChatId = chat._id;
        document.querySelectorAll('.message-enter:not(#typing-indicator)').forEach(el => el.remove());
        document.querySelector('.welcome-message')?.classList.remove('hidden');
        setView('chat'); closeSidebar(); loadSidebarHistory();
    } catch (e) { 
        window.sentriusSounds.error();
        alert("SYSTEM ERROR: Could not initialize new operation."); 
    }
}

async function loadChatSession(id) {
    try {
        currentChatId = id;
        const res = await fetch(`${API_BASE_URL}/chats/${id}`, { headers: { 'x-user-id': USER_ID } });
        if (!res.ok) throw new Error();
        const chat = await res.json();
        document.querySelectorAll('.message-enter:not(#typing-indicator)').forEach(el => el.remove());
        document.querySelector('.welcome-message')?.classList.add('hidden');
        chat.messages.forEach(msg => renderMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, false));
        setView('chat'); closeSidebar(); loadSidebarHistory();
    } catch (e) { console.error(e); }
}

async function sendMessage(e) {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;
    if (!currentChatId) await startNewSession();
    document.querySelector('.welcome-message')?.classList.add('hidden');
    
    window.sentriusSounds.click(); // PLAY CLICK ON SEND
    renderMessage('user', text);
    msgInput.value = '';
    if (window.innerWidth < 768) msgInput.blur();
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);
    try {
        const res = await fetch(`${API_BASE_URL}/chats/${currentChatId}/message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
            body: JSON.stringify({ message: text }), signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        window.sentriusSounds.incoming(); // PLAY INCOMING DATA SOUND
        renderMessage('bot', data.text);
        loadSidebarHistory();
    } catch (err) {
        window.sentriusSounds.error(); // PLAY ERROR SOUND
        renderMessage('bot', err.name === 'AbortError' ? '<span style="color:orange">[TIMEOUT] Neural net overloaded.</span>' : '<span style="color:red">[CONNECTION_LOST] Retrying handshake...</span>');
    } finally { typingIndicator.classList.add('hidden'); }
}

function renderMessage(sender, text, animate = true) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message-enter mb-4 flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    if (!animate) msgDiv.style.animation = 'none';

    const contentDiv = document.createElement('div');
    contentDiv.className = `terminal-box relative group p-3 md:p-4 max-w-[90%] md:max-w-[75%] ${sender === 'user' ? 'bg-green-950/30' : 'bg-black'}`;
    const rawHtml = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
    const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
    contentDiv.innerHTML = `<div class="message-content text-sm md:text-base" style="color:#00ff41">${safeHtml}</div>`;
    contentDiv.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.style.textDecoration = 'underline'; });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'absolute top-2 right-2 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-all duration-200 text-green-800 hover:text-green-500 bg-black/50 px-1';
    copyBtn.innerText = '[CPY]';
    copyBtn.onclick = async () => {
        try {
            await navigator.clipboard.writeText(text);
            copyBtn.innerText = '[COPIED]';
            copyBtn.classList.add('text-green-400');
            setTimeout(() => {
                copyBtn.innerText = '[CPY]';
                copyBtn.classList.remove('text-green-400');
            }, 2000);
        } catch (err) {
             copyBtn.innerText = '[ERR]';
        }
    };
    contentDiv.appendChild(copyBtn);

    msgDiv.appendChild(contentDiv);
    views.chat.insertBefore(msgDiv, typingIndicator);
    if (animate) scrollToBottom();
}

function scrollToBottom(instant = false) {
    views.chat.scrollTo({ top: views.chat.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
}

let currentIntel = { breaches: [], trends: [] };

async function loadNews() {
    const breachGrid = document.getElementById('breach-news-grid');
    const trendsList = document.getElementById('trends-list');
    breachGrid.innerHTML = '<div class="terminal-box p-4 opacity-50 animate-pulse col-span-full">>> DECRYPTING_GLOBAL_FEED...</div>';
    try {
        const res = await fetch(`${API_BASE_URL}/news`);
        if (!res.ok) throw new Error("Failed to fetch intel");
        currentIntel = await res.json();
        breachGrid.innerHTML = currentIntel.breaches.map((item, index) => `
            <div onclick="openNewsModal('breaches', ${index})" class="terminal-box bg-black overflow-hidden cursor-pointer hover:border-green-400 transition-all duration-300 group">
                <div class="h-32 overflow-hidden relative border-b border-green-900">
                     <img src="${item.image}" alt="Breach" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all grayscale group-hover:grayscale-0">
                     <div class="absolute top-2 right-2 bg-black/80 px-2 py-1 text-xs text-green-500 font-mono border border-green-900">[EXPAND]</div>
                     <div class="absolute bottom-0 left-0 bg-black/90 px-2 py-1 text-xs text-red-500 font-mono w-full border-t border-green-900/50 truncate">
                        ${item.source} // ${item.date}
                     </div>
                </div>
                <div class="p-4">
                    <h4 class="font-bold text-green-500 mb-2 truncate group-hover:text-green-300 transition-colors">${item.title}</h4>
                    <p class="text-sm text-green-800 line-clamp-2">${item.summary}</p>
                </div>
            </div>
        `).join('');
        trendsList.innerHTML = currentIntel.trends.map((item, index) => `
            <div onclick="openNewsModal('trends', ${index})" class="terminal-box p-4 bg-green-950/20 hover:bg-green-950/30 transition-all cursor-pointer group border-l-4 border-l-transparent hover:border-l-green-500">
                <div class="flex justify-between items-start mb-1">
                    <h4 class="font-bold text-blue-400 group-hover:text-blue-300 transition-colors line-clamp-1">> ${item.title}</h4>
                     <span class="text-[10px] text-green-900 font-mono group-hover:text-green-500">[READ]</span>
                </div>
                <p class="text-sm text-green-700 group-hover:text-green-400 line-clamp-2">${item.summary}</p>
            </div>
        `).join('');
    } catch (e) {
        breachGrid.innerHTML = '<div class="text-red-500 terminal-box p-4 col-span-full">[ERROR] SECURE FEED OFFLINE</div>';
        trendsList.innerHTML = '';
    }
}

window.openNewsModal = function(type, index) {
    const item = currentIntel[type][index];
    if (!item) return;
    document.getElementById('modal-title').innerText = item.title;
    document.getElementById('modal-source').innerText = item.source;
    document.getElementById('modal-author').innerText = item.author || 'UNKNOWN';
    document.getElementById('modal-date').innerText = item.date;
    document.getElementById('modal-summary').innerText = item.summary;
    document.getElementById('modal-image').src = item.image;
    document.getElementById('modal-link').href = item.url;
    document.getElementById('news-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeNewsModal() {
    document.getElementById('news-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

document.getElementById('enter-chat').addEventListener('click', () => (!currentChatId ? startNewSession() : setView('chat')));
document.getElementById('message-form').addEventListener('submit', sendMessage);
document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
document.getElementById('close-sidebar').addEventListener('click', closeSidebar);
document.getElementById('new-chat-btn-header').addEventListener('click', startNewSession);
document.getElementById('new-chat-btn-sidebar').addEventListener('click', startNewSession);
document.getElementById('news-btn-sidebar').addEventListener('click', () => { setView('news'); closeSidebar(); });
document.getElementById('close-modal-btn').addEventListener('click', closeNewsModal);
document.getElementById('modal-backdrop').addEventListener('click', closeNewsModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNewsModal(); });
document.querySelectorAll('.feature-badge').forEach(btn => btn.addEventListener('click', (e) => {
    msgInput.value = `Run a ${e.target.innerText} operation.`;
    document.getElementById('message-form').dispatchEvent(new Event('submit'));
}));

window.addEventListener('DOMContentLoaded', () => {
    if (USER_ID) { updateProfileUI(); setView('chat'); loadSidebarHistory(); } else { setView('intro'); }
});