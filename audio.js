let context;
let master;
let compressor;
let distortionCurve;
let musicTimer;
let musicStep = 0;
let currentTrackId = null;
let muted = localStorage.getItem('finish-line.audio-muted') === 'true';

function getAudio() {
    if (context) {
        if (context.state === 'suspended') context.resume();
        return context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    // Compressor glues everything together so layered notes/drums read as
    // one loud, controlled signal instead of clipping or sounding thin.
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 8;
    compressor.ratio.value = 8;
    compressor.attack.value = .003;
    compressor.release.value = .18;
    compressor.connect(context.destination);
    master = context.createGain();
    master.gain.value = muted ? 0 : .16;
    master.connect(compressor);
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

function tone(frequency, duration, type = 'sine', volume = 100, delay = 0, detune = 0) {
    if (muted) return;
    const audio = getAudio();
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (detune) oscillator.detune.setValueAtTime(detune, start);
    gain.gain.setValueAtTime(.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .015);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
}

// Layers a few slightly-detuned voices of the same note for a thicker,
// "louder" sound than a single oscillator — used for the lead/bass hooks
// that should carry the track.
function unison(frequency, duration, type, volume, delay = 0, voices = 3, spread = 9) {
    for (let voice = 0; voice < voices; voice += 1) {
        const detune = voices === 1 ? 0 : (voice / (voices - 1) - .5) * 2 * spread;
        tone(frequency, duration, type, volume / Math.sqrt(voices), delay, detune);
    }
}

// A short burst of filtered white noise. Used for percussive hits (hi-hats,
// wind, rock debris) and, sweeping a filter, for explosion/crash rumble.
function noiseBurst(duration, volume, delay = 0, filterType = 'lowpass', freqFrom = 4000, freqTo = null) {
    if (muted) return;
    const audio = getAudio();
    if (!audio) return;
    const start = audio.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freqFrom, start);
    if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, start + duration);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.0006, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + .02);
}

// Soft-clipping curve for the waveshaper, built once per AudioContext and
// reused everywhere — pushes a signal from clean into gritty/driven.
function getDistortionCurve() {
    if (distortionCurve) return distortionCurve;
    const amount = 28;
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i += 1) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    distortionCurve = curve;
    return curve;
}

// A driven low tone for the kick/bass hits that need weight and grit rather
// than a clean sine — routes through a waveshaper before the master bus.
function drivenTone(frequency, duration, volume, delay = 0) {
    if (muted) return;
    const audio = getAudio();
    if (!audio) return;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(frequency, start);
    const shaper = audio.createWaveShaper();
    shaper.curve = getDistortionCurve();
    shaper.oversample = '2x';
    const gain = audio.createGain();
    gain.gain.setValueAtTime(.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .01);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(shaper);
    shaper.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
}

// --- Drum hits, used by every track's rhythm section ---

// Pitched-down thump with a click on top — a synthesized kick drum.
function kick(volume = .22, delay = 0) {
    if (muted) return;
    const audio = getAudio();
    if (!audio) return;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(150, start);
    oscillator.frequency.exponentialRampToValueAtTime(42, start + .13);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + .22);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + .25);
    noiseBurst(.02, volume * .5, delay, 'highpass', 3500);
}

// Noise body plus a short tone core — a synthesized snare.
function snare(volume = .16, delay = 0) {
    noiseBurst(.16, volume, delay, 'bandpass', 1800, 700);
    tone(190, .1, 'triangle', volume * .5, delay);
}

// Very short, bright noise tick — a synthesized hi-hat.
function hihat(volume = .05, delay = 0, open = false) {
    noiseBurst(open ? .18 : .045, volume, delay, 'highpass', 7000);
}

// Each track is a 16-step loop with its own tempo, harmony, timbre and
// drum pattern so the three worlds (and the home/menu screen) don't all
// sound the same.
const TRACKS = {
    // Home / stage-select: warm, unhurried major chords — a "welcome back",
    // not a countdown. Light brushed rhythm instead of a full kit.
    home: {
        stepMs: 260,
        steps: 16,
        play(step) {
            const bass = [130.81, null, null, null, 98.00, null, null, null, 110.00, null, null, null, 87.31, null, null, null][step];
            if (bass) unison(bass, 1.05, 'sine', .07, 0, 2, 5);
            const lead = [null, 196.00, 246.94, null, null, 174.61, 220.00, null, null, 220.00, 261.63, null, null, 196.00, 174.61, null][step];
            if (lead) tone(lead, .5, 'triangle', .045, .02);
            if (step % 8 === 4) noiseBurst(.6, .014, 0, 'lowpass', 900);
            if (step % 8 === 0) hihat(.03, 0);
        },
    },
    // Level 1 — Survival: a driving, syncopated, distorted minor-key chase
    // with a full kick/snare/hat pattern under it.
    'level-1': {
        stepMs: 185,
        steps: 16,
        play(step) {
            const bassPattern = [82.41, null, 82.41, 98.00, null, 82.41, 73.42, null];
            const beat = bassPattern[(step >> 1) % bassPattern.length];
            if (step % 2 === 0 && beat) drivenTone(beat, .24, .13);
            const lead = [null, 329.63, null, 392.00, 349.23, null, 293.66, null, null, 329.63, 392.00, null, 440.00, 392.00, null, 349.23][step];
            if (lead) unison(lead, .22, 'triangle', .08, .015, 2, 6);
            if (step % 4 === 0) kick(.24);
            if (step % 8 === 4) snare(.14);
            if (step % 2 === 1) hihat(.045);
        },
    },
    // Level 2 — Sky City: airier and brighter, wider intervals, with a
    // light four-on-the-floor pulse and wind swells instead of a hard beat.
    'level-2': {
        stepMs: 210,
        steps: 16,
        play(step) {
            const bass = [130.81, null, null, 174.61, null, null, 164.81, null, 146.83, null, null, 174.61, null, null, 130.81, null][step];
            if (bass) unison(bass, .5, 'sine', .07, 0, 2, 4);
            const lead = [523.25, null, 659.25, null, 587.33, null, 783.99, null, 698.46, null, 587.33, null, 523.25, null, 659.25, null][step];
            if (lead) tone(lead, .38, 'sine', .05, .03);
            if (step % 8 === 0) noiseBurst(1.1, .02, 0, 'bandpass', 2200, 1100);
            if (step % 4 === 0) kick(.14);
            if (step % 4 === 2) hihat(.03, 0, true);
        },
    },
    // Level 3 — Crystal Cave: sparse, echoey bell tones over a long sub
    // drone, with a slow deep thump instead of a busy drum pattern.
    'level-3': {
        stepMs: 240,
        steps: 16,
        play(step) {
            if (step === 0) { tone(65.41, 3.7, 'sine', .06); kick(.2); }
            if (step === 8) kick(.16);
            const bell = [392.00, null, null, null, 466.16, null, null, null, 349.23, null, null, null, 415.30, null, null, null][step];
            if (bell) {
                tone(bell, .8, 'sine', .06);
                tone(bell, .5, 'sine', .022, .28); // echo repeat
            }
            if (step % 8 === 6) noiseBurst(.6, .016, 0, 'bandpass', 1400, 850);
        },
    },
};

function playTrack(id) {
    const track = TRACKS[id];
    if (!track) return;
    if (musicTimer) clearInterval(musicTimer);
    currentTrackId = id;
    musicStep = 0;
    musicTimer = window.setInterval(() => {
        track.play(musicStep % track.steps);
        musicStep += 1;
    }, track.stepMs);
}

export function startMusic(theme = 'home') {
    const audio = getAudio();
    if (!audio) return;
    const id = TRACKS[theme] ? theme : 'home';
    if (musicTimer && currentTrackId === id) return;
    playTrack(id);
}

// Picks one of the three world tracks for a stage number, cycling for
// generated stages beyond the first three hand-built worlds.
export function startLevelMusic(level) {
    const index = ((Math.max(1, level) - 1) % 3) + 1;
    startMusic(`level-${index}`);
}

export function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    currentTrackId = null;
}

export function playJump(big = false) {
    tone(big ? 523.25 : 392, .16, 'square', .1);
    tone(big ? 783.99 : 523.25, .2, 'triangle', .07, .08);
}

export function playCoin() {
    tone(659.25, .12, 'sine', .11);
    tone(987.77, .18, 'sine', .08, .09);
}

// A short, sharp impact — for slamming into a rock, wall or enemy. Punchier
// and shorter than the explosion, with clashing dissonance and a snare-like
// noise body.
export function playCrash() {
    tone(140, .12, 'square', .1);
    tone(96, .16, 'square', .08, .02);
    noiseBurst(.22, .18, 0, 'bandpass', 1800, 500);
    noiseBurst(.12, .08, .02, 'highpass', 5000);
    kick(.16, 0);
}

// A fuller ascending fanfare with a sustained, thickened root underneath
// and a sparkle on top, for reaching the finish line.
export function playWin() {
    const notes = [523.25, 659.25, 783.99, 659.25, 987.77, 1046.50];
    notes.forEach((note, index) => unison(note, .3, 'triangle', .12, index * .09, 2, 5));
    unison(261.63, 1, 'sine', .07, 0, 2, 4);
    noiseBurst(.3, .05, notes.length * .09, 'highpass', 7000);
}

export function playLose() {
    tone(196, .35, 'sawtooth', .08);
    tone(146.83, .5, 'sawtooth', .06, .18);
}

// A loud blast: a driven sub-bass thump for punch, a closing noise sweep
// for the boom, a bright crack on top, a kick for extra low-end impact,
// and a low rumbling tail. Timed to land under the game's fireball/shake
// effect when a run is disqualified by falling.
export function playExplosion() {
    drivenTone(55, .5, .24);
    tone(95, .28, 'sawtooth', .1, .015);
    noiseBurst(.4, .26, 0, 'lowpass', 3200, 200);
    noiseBurst(.18, .11, .01, 'highpass', 3800);
    noiseBurst(.9, .07, .1, 'lowpass', 800, 150);
    kick(.26, 0);
}

window.addEventListener('pointerdown', () => { getAudio(); startMusic(); }, { once: true });
window.addEventListener('keydown', () => { getAudio(); startMusic(); }, { once: true });