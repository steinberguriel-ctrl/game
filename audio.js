let context;
let master;
let musicTimer;
let musicStep = 0;
let muted = localStorage.getItem('finish-line.audio-muted') === 'true';

function getAudio() {
    if (context) {
        if (context.state === 'suspended') context.resume();
        return context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : .16;
    master.connect(context.destination);
    return context;
}

export function isMuted() {
    return muted;
}

export function toggleMute() {
    muted = !muted;
    localStorage.setItem('finish-line.audio-muted', String(muted));
    if (master) master.gain.setTargetAtTime(muted ? 0 : .16, context.currentTime, .03);
    return muted;
}

function tone(frequency, duration, type = 'sine', volume = 100, delay = 0) {
    if (muted) return;
    const audio = getAudio();
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .015);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
}

export function startMusic() {
    const audio = getAudio();
    if (!audio || musicTimer) return;
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    musicTimer = window.setInterval(() => {
        tone(melody[musicStep % melody.length], .28, 'triangle', .055);
        if (musicStep % 4 === 0) tone(melody[(musicStep + 2) % melody.length] / 2, .45, 'sine', .035, .02);
        musicStep += 1;
    }, 360);
}

export function playJump(big = false) {
    tone(big ? 523.25 : 392, .16, 'square', .1);
    tone(big ? 783.99 : 523.25, .2, 'triangle', .07, .08);
}

export function playCoin() {
    tone(659.25, .12, 'sine', .11);
    tone(987.77, .18, 'sine', .08, .09);
}

export function playWin() {
    [523.25, 659.25, 783.99].forEach((note, index) => tone(note, .25, 'triangle', .1, index * .12));
}

export function playLose() {
    tone(196, .35, 'sawtooth', .08);
    tone(146.83, .5, 'sawtooth', .06, .18);
}

window.addEventListener('pointerdown', () => { getAudio(); startMusic(); }, { once: true });
window.addEventListener('keydown', () => { getAudio(); startMusic(); }, { once: true });
