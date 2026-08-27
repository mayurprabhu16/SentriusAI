// sound.js - SENTRIUS_AUDIO_DECK

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isMuted = localStorage.getItem('sentrius_muted') === 'true';

// Master Gain (Volume Control)
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
updateMuteState();

function updateMuteState() {
     // If muted, volume is 0. If unmuted, volume is 0.2 (20% to not be too loud)
    masterGain.gain.setValueAtTime(isMuted ? 0 : 0.2, audioCtx.currentTime);
}

function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('sentrius_muted', isMuted);
    updateMuteState();
    return isMuted;
}

// --- SYNTHESIZER FUNCTIONS ---

// 1. Standard UI Click (Short, high-pitch chirp)
function playClick() {
    if (isMuted) return;
    ensureAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

// 2. Error / Access Denied (Low buzzing sawtooth)
function playError() {
    if (isMuted) return;
    ensureAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

// 3. Success / Login / Access Granted (Ascending arpeggio)
function playSuccess() {
    if (isMuted) return;
    ensureAudioContext();
    const now = audioCtx.currentTime;
    
    // Play three quick notes
    [440, 554.37, 659.25].forEach((freq, i) => { // A4, C#5, E5
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGain);

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + (i * 0.1));
        
        gain.gain.setValueAtTime(0.1, now + (i * 0.1));
        gain.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.1) + 0.1);

        osc.start(now + (i * 0.1));
        osc.stop(now + (i * 0.1) + 0.1);
    });
}

// 4. Incoming Data Stream (High speed random blips for bot response)
function playIncomingData() {
    if (isMuted) return;
    ensureAudioContext();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(masterGain);

    osc.type = 'square';
    // Rapidly changing frequency to sound like a modem or fast data
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.setValueAtTime(1500, now + 0.05);
    osc.frequency.setValueAtTime(1800, now + 0.10);
    osc.frequency.setValueAtTime(800, now + 0.15);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.2);
}

// Helper: Browsers block audio until first user interaction.
function ensureAudioContext() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Expose to global scope for main.js to use
window.sentriusSounds = {
    click: playClick,
    error: playError,
    success: playSuccess,
    incoming: playIncomingData,
    toggleMute: toggleMute,
    isMuted: () => isMuted
};