/* =========================================================
   JGVRP Speedometer HUD
   API (dipanggil dari game / CEF):
     setSpeed(m/s)            setRPM(0.0 - 1.0)
     setFuel(0-1 | 0-100)     setHealth(0-1 | 0-1000)
     setGear(n)               setHeadlights(0 off | 1 low | 2 high)
     setSeatbelts(bool)       setLeftIndicator(bool) / setRightIndicator(bool)
     updateLockStatus(state)  setOdometer(miles)
   ========================================================= */

const MPS_TO_MPH = 2.236936;
const MAX_RPM = 8;          // skala tachometer (x1000)
const REDLINE = 7;          // mulai zona merah (x1000)

const NOOP_EL = document.createElement('div');   // pengaman kalau ada elemen yang sudah dihapus dari HTML
const $ = (id) => document.getElementById(id) || NOOP_EL;
const elHud = $('hud');
const svg = $('dial');

// ---------- Helper Parser (JGRP) ----------
function isLockedState(val) {
    return val === true || val === 1 || val === "1" || val === "true" || val === 2 || val === "2";
}
function isTrueValue(val) {
    return val === true || val === 1 || val === "1" || val === "true";
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- Geometri dial ----------
const CX = 250, CY = 205;
const START = 150, SWEEP = 240;                      // derajat (0 = kanan, searah jarum jam)
const R_IN = 96, R_FILL = 172, R_TICK = 190;
const rpmAngle = (ratio) => START + clamp01(ratio) * SWEEP;

const pol = (r, a) => {
    const t = (a * Math.PI) / 180;
    return [(CX + r * Math.cos(t)).toFixed(2), (CY + r * Math.sin(t)).toFixed(2)];
};
function sector(r1, r2, a1, a2) {
    if (a2 - a1 < 0.05) return '';
    const [x1, y1] = pol(r2, a1), [x2, y2] = pol(r2, a2);
    const [x3, y3] = pol(r1, a2), [x4, y4] = pol(r1, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${x1} ${y1}A${r2} ${r2} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}
function arcPath(r, a1, a2) {
    const [x1, y1] = pol(r, a1), [x2, y2] = pol(r, a2);
    return `M${x1} ${y1}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

// Arc samping (segmen): kiri = FUEL (E bawah -> F atas), kanan = OIL PRESS (L bawah -> H atas)
const SIDE_R1 = 205, SIDE_R2 = 216, SIDE_SEGS = 16;
const FUEL_A = [157, 203];      // bawah -> atas (naik sudutnya)
const OIL_A = [23, -23];        // bawah -> atas (turun sudutnya)

function buildSideArc(cls, [aFrom, aTo]) {
    const step = (aTo - aFrom) / SIDE_SEGS;
    const gap = 0.7 * Math.sign(step);
    let s = '';
    for (let i = 0; i < SIDE_SEGS; i++) {
        let a1 = aFrom + i * step + gap / 2, a2 = aFrom + (i + 1) * step - gap / 2;
        if (a1 > a2) [a1, a2] = [a2, a1];
        s += `<path class="seg ${cls}" data-i="${i}" d="${sector(SIDE_R1, SIDE_R2, a1, a2)}"/>`;
    }
    // garis skala tipis di dalam arc
    const lo = Math.min(aFrom, aTo), hi = Math.max(aFrom, aTo);
    s += `<path d="${arcPath(198, lo, hi)}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        const a = aFrom + (aTo - aFrom) * t;
        const [x1, y1] = pol(198, a), [x2, y2] = pol(t % 0.5 === 0 ? 191 : 194, a);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`;
    });
    return s;
}

function buildDial() {
    let s = `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0d0f13" stop-opacity="0.55"/>
        <stop offset="0.35" stop-color="#090a0d" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#050506" stop-opacity="0.95"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="fillGrad" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="${R_FILL}">
        <stop offset="0.55" stop-color="#ff1a22" stop-opacity="0"/>
        <stop offset="0.72" stop-color="#d0141b" stop-opacity="0.28"/>
        <stop offset="0.93" stop-color="#ff2a2f" stop-opacity="0.72"/>
        <stop offset="1" stop-color="#ff4a4e" stop-opacity="0.95"/>
      </radialGradient>
      <radialGradient id="hub" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY - 20}" r="${R_IN}">
        <stop offset="0" stop-color="#16181d"/>
        <stop offset="1" stop-color="#060607"/>
      </radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <clipPath id="rpmClip"><path id="rpm-clip-path" d=""/></clipPath>
    </defs>

    <!-- latar -->
    <path d="M32 2 H468 Q498 2 498 32 V308 Q498 338 468 338 H32 Q2 338 2 308 V32 Q2 2 32 2 Z" fill="url(#bg)"/>
    <path d="M60 338 H440" stroke="url(#edge)" stroke-width="1.5"/>

    <!-- dasar dial -->
    <path d="${sector(R_IN, R_TICK + 2, START, START + SWEEP)}" fill="rgba(255,255,255,0.025)"/>
    <path d="${arcPath(R_TICK + 4, START - 2, START + SWEEP + 2)}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="2"/>
    <path d="${arcPath(R_TICK + 9, START + 6, START + SWEEP - 6)}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>

    <!-- isian merah mengikuti RPM -->
    <g clip-path="url(#rpmClip)">
      <path d="${sector(R_IN, R_FILL, START, START + SWEEP)}" fill="url(#fillGrad)"/>
      <g stroke="#ff3a3f" stroke-opacity="0.38" stroke-width="1">`;
    for (let a = START; a <= START + SWEEP; a += 1.6) {
        const [x1, y1] = pol(R_IN + 34, a), [x2, y2] = pol(R_FILL, a);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    s += `</g>
    </g>
    <path id="trail-1" fill="#ff2a2f" fill-opacity="0.16" d=""/>
    <path id="trail-2" fill="#ff2a2f" fill-opacity="0.18" d=""/>
    <path id="trail-3" fill="#ff5a5e" fill-opacity="0.22" d=""/>`;

    // tick halus per 100 RPM
    s += '<g stroke-linecap="butt">';
    for (let i = 0; i <= MAX_RPM * 10; i++) {
        const a = rpmAngle(i / (MAX_RPM * 10));
        const major = i % 10 === 0, half = i % 5 === 0;
        const [x1, y1] = pol(major ? 164 : half ? 174 : 179, a), [x2, y2] = pol(R_TICK, a);
        const rl = i >= REDLINE * 10 ? ' rl' : '';
        s += `<line class="tk${rl}" data-i="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${major ? 3.2 : half ? 2.2 : 1.4}"/>`;
    }
    s += '</g>';

    // zona merah 7-8
    s += `<path id="redline-arc" d="${arcPath(160, rpmAngle(REDLINE / MAX_RPM), rpmAngle(1))}" fill="none" stroke="#ff2a2f" stroke-width="4" filter="url(#glow)"/>`;

    // angka 0-8
    for (let v = 0; v <= MAX_RPM; v++) {
        const [x, y] = pol(140, rpmAngle(v / MAX_RPM));
        s += `<text class="num${v >= REDLINE ? ' rl' : ''}" data-v="${v}" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${v}</text>`;
    }
    const [lx, ly] = pol(118, 270);
    s += `<text class="scale-lbl" x="${lx}" y="${Number(ly) + 6}" text-anchor="middle">x1000 r/min</text>`;

    // hub tengah
    s += `<circle cx="${CX}" cy="${CY}" r="${R_IN}" fill="url(#hub)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
          <circle cx="${CX}" cy="${CY}" r="${R_IN - 8}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;

    // jarum digital (garis merah + palang kecil)
    s += `<g id="needle" filter="url(#glow)" transform="rotate(${START} ${CX} ${CY})">
            <line x1="${CX + R_IN + 2}" y1="${CY}" x2="${CX + R_TICK + 4}" y2="${CY}" stroke="#ff2a2f" stroke-width="4" stroke-linecap="round"/>
            <line x1="${CX + R_FILL - 2}" y1="${CY - 7}" x2="${CX + R_FILL - 2}" y2="${CY + 7}" stroke="#ff2a2f" stroke-width="3" stroke-linecap="round"/>
            <line x1="${CX + R_IN + 30}" y1="${CY}" x2="${CX + R_TICK + 2}" y2="${CY}" stroke="#ffd0d1" stroke-width="1.2"/>
          </g>`;

    // arc samping
    s += buildSideArc('fuel-seg', FUEL_A) + buildSideArc('oil-seg', OIL_A);
    const lbl = (txt, r, a, id) => {
        const [x, y] = pol(r, a);
        return `<text class="arc-lbl" ${id ? `id="${id}"` : ''} x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${txt}</text>`;
    };
    s += lbl('E', 231, FUEL_A[0] + 4, 'fuel-e') + lbl('F', 231, FUEL_A[1] - 4);
    s += lbl('L', 231, OIL_A[0] - 4, 'oil-l') + lbl('H', 231, OIL_A[1] + 4);
    const [fx, fy] = pol(236, 180), [ox, oy] = pol(236, 0);
    s += `<text class="scale-lbl" x="${fx}" y="${fy}" text-anchor="middle" dominant-baseline="central" transform="rotate(-90 ${fx} ${fy})">FUEL</text>`;
    s += `<text class="scale-lbl" x="${ox}" y="${oy}" text-anchor="middle" dominant-baseline="central" transform="rotate(90 ${ox} ${oy})">OIL PRESS</text>`;

    svg.innerHTML = s;
}
buildDial();

const needle = $('needle');
const clipPath = $('rpm-clip-path');
const trails = [$('trail-1'), $('trail-2'), $('trail-3')];
const ticks = svg.querySelectorAll('.tk');
const nums = svg.querySelectorAll('.num');
const fuelSegs = svg.querySelectorAll('.fuel-seg');
const oilSegs = svg.querySelectorAll('.oil-seg');

// ---------- State ----------
const state = {
    mph: 0,
    rpm: 0,          // target 0-1 dari game
    rpmShown: 0,     // nilai yang di-smooth untuk animasi
    health: 1,       // 0-1
    fuel: 0,
    healthShown: 0,  // 0-1, di-smooth untuk arc OIL PRESS
    lastTick: -1,
    trip: 0,
    belted: false,
    engine: false,   // dari setEngine(); alarm hanya bunyi saat mesin hidup
    mps: 0,          // kecepatan mentah (m/s)
};
let bootUntil = performance.now() + 1700;

function renderRpm(ratio) {
    const a = rpmAngle(ratio);
    needle.setAttribute('transform', `rotate(${a.toFixed(2)} ${CX} ${CY})`);
    clipPath.setAttribute('d', sector(R_IN, R_FILL + 1, START, a));
    trails[0].setAttribute('d', sector(R_IN + 40, R_FILL, Math.max(START, a - 34), a));
    trails[1].setAttribute('d', sector(R_IN + 55, R_FILL, Math.max(START, a - 16), a));
    trails[2].setAttribute('d', sector(R_IN + 70, R_FILL, Math.max(START, a - 6), a));

    const lit = Math.round(ratio * MAX_RPM * 10);
    if (lit !== state.lastTick) {
        state.lastTick = lit;
        ticks.forEach((t, i) => t.classList.toggle('on', i <= lit && ratio > 0.003));
        nums.forEach((n, v) => n.classList.toggle('on', v * 10 <= lit));
    }
    elHud.classList.toggle('redline', ratio >= REDLINE / MAX_RPM);

}

function padDigits(n, len) {
    const s = String(Math.max(0, n)).padStart(len, '0');
    const firstSig = s.search(/[1-9]/);
    const cut = firstSig === -1 ? len - 1 : firstSig;
    return `<span class="dim">${s.slice(0, cut)}</span><span class="bright">${s.slice(cut)}</span>`;
}

function fillSegs(segs, ratio) {
    const n = Math.round(clamp01(ratio) * segs.length);
    segs.forEach((seg, i) => seg.classList.toggle('on', i < n));
}

// ---------- Loop animasi ----------
let lastFrame = performance.now();
function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    let target = state.rpm;
    if (now < bootUntil) {
        // sweep jarum saat kontak ON
        const t = 1 - (bootUntil - now) / 1700;
        target = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.55) / 0.45);
        if (t >= 0.45 && t < 0.55) target = 1;
    } else if (elHud.classList.contains('booting')) {
        elHud.classList.remove('booting');
    }

    const k = now < bootUntil ? 1 : Math.min(1, dt * 14);
    state.rpmShown += (target - state.rpmShown) * k;
    if (Math.abs(target - state.rpmShown) < 0.0005) state.rpmShown = target;
    renderRpm(state.rpmShown);

    // OIL PRESS = nilai setHealth (0-100%), di-smooth
    const hp = now < bootUntil ? target : state.health;
    state.healthShown += (hp - state.healthShown) * Math.min(1, dt * 6);
    fillSegs(oilSegs, state.healthShown);
    $('oil-val').textContent = Math.round(state.healthShown * 100);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 1. Kecepatan ----------
window.setSpeed = function (speed) {
    const mph = Math.round(Number(speed || 0) * MPS_TO_MPH);
    state.mph = mph;
    state.mps = Number(speed || 0);
    $('speed-display').innerHTML = padDigits(mph, 3);
};

// ---------- 2. RPM (0.0 - 1.0) ----------
window.setRPM = function (rpm) {
    state.rpm = clamp01(Number(rpm || 0));
};

// ---------- 3. Fuel ----------
window.setFuel = function (fuel) {
    const val = Number(fuel || 0);
    const percent = clamp01(val > 1 ? val / 100 : val);
    state.fuel = percent;
    $('fuel-val').textContent = Math.round(percent * 100);
    fillSegs(fuelSegs, percent);
    const low = percent < 0.20;
    fuelSegs.forEach((s) => s.classList.toggle('low', low));
    elHud.classList.toggle('fuel-low', low);
    $('fuel-e').classList.toggle('warn', low);
};

// ---------- 4. Engine Health -> arc OIL PRESS (nilai & arc langsung dari setHealth) ----------
window.setHealth = function (health) {
    const val = Number(health || 0);
    const percent = clamp01(val > 1 ? val / 1000 : val);
    state.health = percent;

    const warn = percent <= 0.5 && percent > 0.3;
    const crit = percent <= 0.3;
    elHud.classList.toggle('oil-warn', warn);
    elHud.classList.toggle('oil-crit', crit);
    $('oil-l').classList.toggle('warn', crit);

};

// ---------- 5. Gear ----------
window.setGear = function (gear) {
    let g = String(gear);
    if (gear == 0 || g === '0' || g.toUpperCase() === 'R') g = 'R';
    else if (gear === null || gear === undefined || g === '' || g.toUpperCase() === 'N') g = 'N';
    $('gear').textContent = g;
    $('gear').style.color = g === 'R' ? 'var(--red)' : '';
};

// ---------- 6. Lock / Unlock Vehicle (Mendukung semua alternatif panggilan JGRP) ----------
window.updateLockStatus = function (state) {
    const locked = isLockedState(state);
    $('door-lock').className = locked ? 'icon-item locked' : 'icon-item';  // gembok tertutup kuning = terkunci
    elHud.classList.toggle('is-locked', locked);
};
window.setDoors = window.updateLockStatus;
window.setDoorLock = window.updateLockStatus;
window.setVehicleLocked = window.updateLockStatus;
window.setLocked = window.updateLockStatus;
window.setLock = window.updateLockStatus;
window.toggleLock = window.updateLockStatus;

// ---------- 7. Lampu (0 = mati, 1 = low beam, 2 = high beam) ----------
window.setHeadlights = function (state) {
    const val = Number(state || 0);
    // satu ikon saja: low = hijau (garis miring), high = biru (garis lurus), mati = redup
    $('headlight').className = val === 2 ? 'icon-item high-beam' : val === 1 ? 'icon-item active' : 'icon-item';
};

// ---------- 8. Sein (dinonaktifkan) ----------
window.setLeftIndicator = function () {};    // sein dihapus dari tampilan
window.setRightIndicator = function () {};

// ---------- 9. Seatbelt (true = terpasang) ----------
window.setSeatbelts = function (val) {
    const on = isTrueValue(val);
    state.belted = on;
    $('seatbelts').className = on ? 'icon-item active' : 'icon-item warn';
};

// ---------- 10. Odometer (mil) ----------
window.setOdometer = function (distance) {
    $('odometer').textContent = Number(distance || 0).toFixed(1);
};

// ---------- Intro ANNIS (bisa dipanggil ulang: playIntro()) ----------
let introTimer;
window.playIntro = function () {
    elHud.classList.remove('intro-on');
    void elHud.offsetWidth;                 // restart animasi CSS
    elHud.classList.add('intro-on');
    bootUntil = performance.now() + 1700;   // jarum RPM ikut menyapu
    clearTimeout(introTimer);
    introTimer = setTimeout(() => elHud.classList.remove('intro-on'), 2750);
};

// ---------- Suara peringatan (dibuat lewat Web Audio, tanpa file mp3) ----------
// Ubah nilai di SND untuk mengatur suara. Matikan semua: setHudSound(false)
const SND = {
    enabled: true,
    volume: 0.3,            // 0 - 1
    seatbeltEvery: 2000,    // ms jeda antar bunyi seatbelt (berulang terus sampai seatbelt dipasang)
    seatbeltMinSpeed: 1,    // m/s: seatbelt hanya bunyi saat mobil bergerak lebih cepat dari ini (0 = selalu, 1 m/s ~ 2 mph)
    fuelBelow: 0.20,        // bensin di bawah 20%
    fuelEvery: 30000,       // ms jeda antar chime bensin
};
// Suara hanya bunyi kalau mesin HIDUP (setEngine(true)).
// Matikan via link: ?nosound / ?mute / ?silent / ?noalarm   Volume via link: ?volume=0.0-1.0
try {
    const q = new URLSearchParams(location.search);
    ['nosound', 'mute', 'silent', 'noalarm', 'noseatbelt', 'nobelt'].forEach((k) => {
        if (q.has(k) && !['0', 'false', 'no', 'off'].includes((q.get(k) || '').toLowerCase())) SND.enabled = false;
    });
    if (q.has('volume') && !isNaN(parseFloat(q.get('volume')))) SND.volume = Math.max(0, Math.min(1, parseFloat(q.get('volume'))));
} catch (e) {}
let audioCtx = null;
function getAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}
function tone(freq, start, dur, type, vol) {
    const a = getAudio();
    if (!a) return;
    const t0 = a.currentTime + start;
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, SND.volume * vol), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
}
window.playHudSound = function (kind) {
    if (!SND.enabled) return;
    if (kind === 'seatbelt') {                       // beep-beep
        tone(1000, 0.00, 0.14, 'triangle', 1);
        tone(1000, 0.22, 0.14, 'triangle', 1);
    } else if (kind === 'fuel') {                    // ding-dong
        tone(988, 0.00, 0.45, 'sine', 1);
        tone(1976, 0.00, 0.30, 'sine', 0.25);
        tone(740, 0.30, 0.70, 'sine', 1);
        tone(1480, 0.30, 0.45, 'sine', 0.25);
    }
};
window.setHudSound = function (on, volume) {
    SND.enabled = !!on;
    if (volume !== undefined) SND.volume = clamp01(Number(volume));
};
// Browser butuh interaksi pertama untuk membuka audio (di CEF/FiveM biasanya langsung jalan)
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, getAudio, { once: true }));

let lastSeatBeep = -Infinity, lastFuelChime = -Infinity;
setInterval(() => {
    if (!SND.enabled || elHud.classList.contains('intro-on')) return;
    const now = performance.now();

    // Seatbelt: mesin hidup + belum dipasang + mobil bergerak
    const seatWarn = state.engine && !state.belted && state.mps > SND.seatbeltMinSpeed;
    if (!seatWarn) lastSeatBeep = -Infinity;          // kondisi hilang -> siap bunyi lagi saat muncul
    else if (now - lastSeatBeep >= SND.seatbeltEvery) {
        lastSeatBeep = now;
        window.playHudSound('seatbelt');
    }

    // Bensin < 20% dan mesin hidup
    const fuelWarn = state.engine && state.fuel < SND.fuelBelow;
    if (!fuelWarn) lastFuelChime = -Infinity;
    else if (now - lastFuelChime >= SND.fuelEvery) {
        lastFuelChime = now;
        window.playHudSound('fuel');
    }
}, 250);

// ---------- Engine (JGVRP: setEngine(true/false)) ----------
window.setEngine = function (on) {
    state.engine = isTrueValue(on);
};
// Alias kontrol suara (nama sama dengan template JGVRP)
window.setSeatbeltSoundEnabled = (on) => window.setHudSound(!!on);
window.setSeatbeltVolume = (v) => { const n = parseFloat(v); if (!isNaN(n)) window.setHudSound(SND.enabled, n); };

// Pesan gaya NUI: window.postMessage({ action: 'setEngine', state: true })
window.addEventListener('message', function (event) {
    const d = event.data;
    if (!d || typeof d !== 'object' || !d.action) return;
    try {
        switch (d.action) {
            case 'setEngine': window.setEngine(d.state); break;
            case 'setSpeed': window.setSpeed(Number(d.speed) || 0); break;
            case 'setRPM': window.setRPM(Number(d.rpm) || 0); break;
            case 'setFuel': window.setFuel(Number(d.fuel) || 0); break;
            case 'setHealth': window.setHealth(Number(d.health) || 0); break;
            case 'setGear': window.setGear(d.gear !== undefined ? d.gear : 'N'); break;
            case 'setHeadlights': window.setHeadlights(Number(d.state) || 0); break;
            case 'setSeatbelts': window.setSeatbelts(!!d.state); break;
            case 'setOdometer': window.setOdometer(Number(d.distance) || 0); break;
            case 'muteSeatbelt': window.setSeatbeltSoundEnabled(false); break;
            case 'unmuteSeatbelt': window.setSeatbeltSoundEnabled(true); break;
            case 'setSeatbeltSound': window.setSeatbeltSoundEnabled(d.enabled !== undefined ? !!d.enabled : !d.disabled); break;
            case 'setVolume': window.setSeatbeltVolume(d.volume !== undefined ? d.volume : d.value); break;
        }
    } catch (e) { /* abaikan pesan rusak */ }
});

// ---------- Message handler ----------
window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'setDoors' || data.action === 'setDoors' || data.type === 'lock') {
        window.updateLockStatus(data.status !== undefined ? data.status : data.state);
    }
    if (data.type === 'playIntro' || data.action === 'playIntro') window.playIntro();
});

// ---------- Nilai awal ----------
window.setSpeed(0);
window.setRPM(0);
window.setFuel(100);
window.setHealth(1000);
window.setGear('N');
window.setHeadlights(0);
window.setSeatbelts(false);
window.setEngine(false);
window.updateLockStatus(false);
window.setOdometer(0);
window.playIntro();   // animasi ANNIS saat HUD pertama kali dipakai

// ---------- Demo (otomatis di preview Netlify atau dengan ?demo) ----------
const params = new URLSearchParams(location.search);
const isPreview = params.has('demo') || (/netlify\.app$/.test(location.hostname) && !params.has('nodemo'));

if (isPreview) {
    document.body.classList.add('preview');
    const GEAR_TOP = [0, 28, 48, 72, 98, 128, 165];   // batas mph per gigi
    let mps = 0, gear = 1, throttle = true, odo = 18452.3, health = 1000, fuel = 86, t = 0;

    setTimeout(() => {
        setEngine(true);
        setTimeout(() => setSeatbelts(true), 9000);   // belum dipasang 9 detik pertama -> terdengar beep
        setHeadlights(1);
        setInterval(() => {
            t += 0.05;
            const mph = mps * MPS_TO_MPH;
            if (throttle) mps += 0.38 / gear; else mps -= 0.55;
            if (mph > 150) throttle = false;
            if (mps <= 0) { mps = 0; throttle = true; }

            while (gear < 6 && mph > GEAR_TOP[gear]) gear++;
            while (gear > 1 && mph < GEAR_TOP[gear - 1] - 6) gear--;
            const lo = GEAR_TOP[gear - 1], hi = GEAR_TOP[gear];
            const rpm = 0.11 + clamp01((mph - lo) / (hi - lo)) * (throttle ? 0.82 : 0.6);

            health = Math.max(180, health - 0.9);
            if (health <= 180) health = 1000;
            fuel = fuel <= 4 ? 86 : fuel - 0.02;
            odo += (mph * 0.05) / 3600;

            setSpeed(mps);
            setRPM(rpm);
            setGear(gear);
            setHealth(health);
            setFuel(fuel);
            setOdometer(odo);
            setLeftIndicator(Math.floor(t / 6) % 4 === 1);
            setRightIndicator(Math.floor(t / 6) % 4 === 3);
            setHeadlights(Math.floor(t / 9) % 3 === 2 ? 2 : 1);
            updateLockStatus(Math.floor(t / 7) % 2);
        }, 50);
    }, 3000);
}