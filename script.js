// ================== KONFIGURASI ==================
const SPEED_UNIT = 'mph';   // 'mph' atau 'kmh'
const MAX_RPM = 8;          // skala tachometer (x1000)
const RED_RPM = 7;          // mulai redzone (x1000)
const OIL_WARN = 0.50;      // engine health (oil pressure) <= 50% -> oranye
const OIL_DANGER = 0.25;    // engine health (oil pressure) <= 25% -> merah berkedip
const FUEL_WARN = 0.20;     // fuel <= 20% -> oranye
const FUEL_DANGER = 0.10;   // fuel <= 10% -> merah berkedip

const UNIT = SPEED_UNIT === 'kmh'
    ? { factor: 3.6, max: 240, major: 20, minor: 10, label: 'km/h', odo: 'km' }
    : { factor: 2.236936, max: 180, major: 20, minor: 10, label: 'mph', odo: 'mi' };

const $ = (id) => document.getElementById(id);
const elHud = $('hud');
const elSpeed = $('speed-display');
const elGear = $('gear');
const elOdo = $('odometer');
const elRpmVal = $('rpm-val');
const elRpmGauge = $('rpm-gauge');
$('speed-mode').textContent = UNIT.label;
$('odo-unit').textContent = UNIT.odo;

// ---------- Helper Parser (JGRP) ----------
function isLockedState(val) {
    return val === true || val === 1 || val === "1" || val === "true" || val === 2 || val === "2";
}
function isTrueValue(val) {
    return val === true || val === 1 || val === "1" || val === "true";
}

// ---------- Gauge builder (SVG) ----------
const CX = 120, START = 135, SWEEP = 248;
const ang = (v, max) => START + (v / max) * SWEEP;
const pol = (r, a) => {
    const t = (a * Math.PI) / 180;
    return [(CX + r * Math.cos(t)).toFixed(2), (CX + r * Math.sin(t)).toFixed(2)];
};
function band(r1, r2, a1, a2) {
    const [x1, y1] = pol(r2, a1), [x2, y2] = pol(r2, a2);
    const [x3, y3] = pol(r1, a2), [x4, y4] = pol(r1, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${x1} ${y1}A${r2} ${r2} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}

function buildGauge(svg, { max, major, minor, red, label, small }) {
    const gid = 'face-' + svg.id;
    let s = `
      <defs>
        <radialGradient id="${gid}" cx="50%" cy="40%" r="62%">
          <stop offset="0" stop-color="#ffd61f"/><stop offset="0.8" stop-color="#f2bf00"/><stop offset="1" stop-color="#c99a00"/>
        </radialGradient>
        <linearGradient id="${gid}-ring" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5a5a62"/><stop offset="0.5" stop-color="#1a1a1e"/><stop offset="1" stop-color="#3a3a40"/>
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="119" fill="url(#${gid}-ring)"/>
      <circle cx="120" cy="120" r="115" fill="#0b0b0d"/>
      <circle cx="120" cy="120" r="112" fill="url(#${gid})"/>`;

    if (red !== undefined) {
        s += `<path class="redzone" d="${band(58, 112, ang(red, max), ang(max, max))}" fill="#e5242b"/>`;
    }

    for (let v = 0; v <= max + 1e-6; v += minor) {
        const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
        const a = ang(v, max);
        const [x1, y1] = pol(112, a), [x2, y2] = pol(isMajor ? 97 : 105, a);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0b0b0d" stroke-width="${isMajor ? 2.6 : 1.3}"/>`;
        if (isMajor) {
            const [tx, ty] = pol(85, a);
            const onRed = red !== undefined && v >= red;
            s += `<text class="tick-label${small ? ' small' : ''}${onRed ? ' on-red' : ''}" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${label(v)}</text>`;
        }
    }

    s += `
      <circle cx="120" cy="120" r="58" fill="#0b0b0d"/>
      <circle cx="120" cy="120" r="54" fill="none" stroke="#1f1f24" stroke-width="1.5"/>
      <text class="face-brand" x="120" y="98" text-anchor="middle">JGVRP</text>
      <g class="needle" style="transform:rotate(${START + 90}deg)">
        <path d="M117.2 138 L119.2 18 L120.8 18 L122.8 138 Z" fill="#e5242b"/>
      </g>
      <circle cx="120" cy="120" r="11" fill="#17171b" stroke="#3a3a42" stroke-width="2"/>
      <circle cx="120" cy="120" r="3.5" fill="#e5242b"/>`;

    svg.innerHTML = s;
    return svg.querySelector('.needle');
}

const rpmNeedle = buildGauge($('rpm-svg'), { max: MAX_RPM, major: 1, minor: 0.5, red: RED_RPM, label: (v) => v });
const spdNeedle = buildGauge($('spd-svg'), { max: UNIT.max, major: UNIT.major, minor: UNIT.minor, label: (v) => v, small: true });

function moveNeedle(needle, ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    needle.style.transform = `rotate(${START + r * SWEEP + 90}deg)`;
}

// ---------- Tile helper ----------
function setTile(tileId, valId, text, ratio, level) {
    const tile = $(tileId);
    $(valId).textContent = text;
    tile.querySelector('.bar i').style.height = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    tile.classList.toggle('warn', level === 'warn');
    tile.classList.toggle('danger', level === 'danger');
}
const levelOf = (p, warn, danger) => (p <= danger ? 'danger' : p <= warn ? 'warn' : '');

// ---------- State (disimpan supaya intro tidak menimpa data game) ----------
let introActive = true;
let gameConnected = false;      // true setelah game memanggil salah satu fungsi API
let demoTimer = null;
const state = { speed: 0, rpm: 0, prevRpm: 0, health: 1 };

function renderNeedles() {
    moveNeedle(spdNeedle, state.speed / UNIT.max);
    moveNeedle(rpmNeedle, state.rpm);
}

// Bungkus fungsi API: panggilan pertama dari game mematikan mode demo
function api(fn) {
    return function (...args) {
        if (!gameConnected && !api.internal) stopDemo();
        return fn.apply(this, args);
    };
}

// ---------- 1. Kecepatan (m/s) ----------
window.setSpeed = api(function (speed) {
    const v = Math.round(Number(speed || 0) * UNIT.factor);
    state.speed = v;
    const padded = String(v).padStart(3, '0');

    if (v < 10) {
        elSpeed.innerHTML = `<span class="dim">${padded.slice(0, 2)}</span><span class="bright">${padded.slice(2)}</span>`;
    } else if (v < 100) {
        elSpeed.innerHTML = `<span class="dim">${padded.slice(0, 1)}</span><span class="bright">${padded.slice(1)}</span>`;
    } else {
        elSpeed.innerHTML = `<span class="bright">${padded}</span>`;
    }
    if (!introActive) moveNeedle(spdNeedle, v / UNIT.max);
});

// ---------- 2. RPM (0.0 - 1.0) ----------
window.setRPM = api(function (rpm) {
    const val = Math.max(0, Math.min(1, Number(rpm || 0)));
    state.rpm = val;
    elRpmVal.textContent = Math.round(val * MAX_RPM * 1000);
    elRpmGauge.classList.toggle('redline', val >= RED_RPM / MAX_RPM);
    if (!introActive) moveNeedle(rpmNeedle, val);
});

// ---------- 3. Fuel (tile "FUEL", menggantikan INJ DUTY) ----------
window.setFuel = api(function (fuel) {
    const val = Number(fuel || 0);
    const percent = Math.max(0, Math.min(1, val > 1 ? val / 100 : val));
    setTile('tile-fuel', 'fuel-val', Math.round(percent * 100), percent, levelOf(percent, FUEL_WARN, FUEL_DANGER));
});

// ---------- 4. Engine Health (tile "OIL PRESSURE") ----------
window.setHealth = api(function (health) {
    const val = Number(health || 0);
    const percent = Math.max(0, Math.min(1, val > 1 ? val / 1000 : val));
    state.health = percent;
    setTile('tile-health', 'health-val', Math.round(percent * 100), percent, levelOf(percent, OIL_WARN, OIL_DANGER));

    const engineIcon = $('engine-icon');
    if (engineIcon) {
        engineIcon.className = 'ci';
        if (percent <= OIL_DANGER) engineIcon.classList.add('active-danger');
        else if (percent <= OIL_WARN) engineIcon.classList.add('active-warn');
    }
});

// ---------- 5. Gear ----------
window.setGear = api(function (gear) {
    elGear.innerText = (gear == 0 || gear === "0") ? 'R' : String(gear);
});

// ---------- 6. Lock / Unlock ----------
window.updateLockStatus = api(function (s) {
    const el = $('door-lock');
    if (el) el.className = isLockedState(s) ? 'ci locked' : 'ci';
});
window.setDoors = window.updateLockStatus;
window.setDoorLock = window.updateLockStatus;
window.setVehicleLocked = window.updateLockStatus;
window.setLocked = window.updateLockStatus;
window.setLock = window.updateLockStatus;
window.toggleLock = window.updateLockStatus;

// ---------- 7. Lampu ----------
window.setHeadlights = api(function (s) {
    const val = Number(s || 0);
    $('headlight-low').className = (val === 1) ? 'ci active' : 'ci';
    $('headlight-high').className = (val === 2) ? 'ci high-beam' : 'ci';
});

// ---------- 8. Sein ----------
window.setLeftIndicator = api(function (s) {
    $('indicator-left').className = isTrueValue(s) ? 'icon-item arrow active' : 'icon-item arrow';
});
window.setRightIndicator = api(function (s) {
    $('indicator-right').className = isTrueValue(s) ? 'icon-item arrow active' : 'icon-item arrow';
});

// ---------- 9. Seatbelt ----------
window.setSeatbelts = api(function (s) {
    $('seatbelts').className = isTrueValue(s) ? 'ci active' : 'ci warn';
});

// ---------- 10. Odometer ----------
window.setOdometer = api(function (distance) {
    if (elOdo) elOdo.innerText = Number(distance || 0).toFixed(1);
});

// ---------- Sensor tambahan (tampilan, diturunkan dari RPM & kecepatan) ----------
// Game tidak mengirim MAP / CTS / IAT / IGN / TPS / BATTERY, jadi nilainya
// disimulasikan secara halus dari RPM, kecepatan dan engine health.
const sim = { map: 0, cts: 25, iat: 25, ign: 0, tps: 0, batt: 12.6 };
const lerp = (a, b, t) => a + (b - a) * t;

function tickSensors() {
    const running = state.rpm > 0.02;
    const rpm = state.rpm;
    const accel = Math.max(0, rpm - state.prevRpm);
    state.prevRpm = rpm;

    const tpsTarget = running ? Math.min(100, rpm * 85 + accel * 900) : 0;
    sim.tps = lerp(sim.tps, tpsTarget, 0.25);
    sim.map = lerp(sim.map, running ? 2 + rpm * 16 + sim.tps * 0.06 : 0, 0.2);
    sim.ign = lerp(sim.ign, running ? 8 + rpm * 26 - sim.tps * 0.08 : 0, 0.2);
    // mesin rusak -> suhu naik
    const ctsTarget = running ? 88 + rpm * 10 + (1 - state.health) * 30 : 25;
    sim.cts = lerp(sim.cts, ctsTarget, running ? 0.01 : 0.003);
    sim.iat = lerp(sim.iat, running ? 32 + rpm * 18 - Math.min(state.speed, 120) * 0.05 : 26, 0.02);
    sim.batt = lerp(sim.batt, running ? 13.8 - rpm * 0.2 : 12.6, 0.1);

    setTile('tile-map', 'map-val', Math.round(sim.map), sim.map / 20);
    setTile('tile-cts', 'cts-val', Math.round(sim.cts), sim.cts / 120, sim.cts >= 110 ? 'danger' : sim.cts >= 100 ? 'warn' : '');
    setTile('tile-iat', 'iat-val', Math.round(sim.iat), sim.iat / 80);
    setTile('tile-ign', 'ign-val', Math.round(sim.ign), sim.ign / 40);
    setTile('tile-tps', 'tps-val', Math.round(sim.tps), sim.tps / 100);
    setTile('tile-batt', 'batt-val', sim.batt.toFixed(2), (sim.batt - 10) / 5, sim.batt < 11.8 ? 'warn' : '');
}
setInterval(tickSensors, 100);

// ---------- Intro: siluet mobil + tes jarum ----------
window.playIntro = function () {
    const intro = $('intro');
    introActive = true;
    elHud.classList.add('sweeping');

    // restart animasi CSS & SMIL
    intro.classList.remove('done');
    intro.style.animation = 'none';
    intro.querySelectorAll('.stage, .beam, .intro-brand').forEach((e) => { e.style.animation = 'none'; });
    void intro.offsetWidth;
    intro.style.animation = '';
    intro.querySelectorAll('.stage, .beam, .intro-brand').forEach((e) => { e.style.animation = ''; });
    const anim = $('scan-anim');
    if (anim && anim.beginElement) anim.beginElement();

    moveNeedle(spdNeedle, 0);
    moveNeedle(rpmNeedle, 0);

    setTimeout(() => { moveNeedle(spdNeedle, 1); moveNeedle(rpmNeedle, 1); }, 2800); // jarum naik
    setTimeout(() => { moveNeedle(spdNeedle, 0); moveNeedle(rpmNeedle, 0); }, 3700); // jarum turun
    setTimeout(() => {
        intro.classList.add('done');
        elHud.classList.remove('sweeping');
        introActive = false;
        renderNeedles();                                                              // pakai data game terbaru
    }, 4600);
};

// ---------- Message handler ----------
window.addEventListener('message', function (event) {
    if (!event.data) return;
    const data = event.data;
    if (data.type === 'setDoors' || data.action === 'setDoors' || data.type === 'lock') {
        window.updateLockStatus(data.status !== undefined ? data.status : data.state);
    }
    if (data.type === 'playIntro' || data.action === 'playIntro') window.playIntro();
});

// ---------- Mode demo (preview di browser) ----------
// Aktif jika URL berisi ?demo atau game tidak memanggil API dalam 5 detik.
function internal(fn, ...args) { api.internal = true; fn(...args); api.internal = false; }

function startDemo() {
    if (demoTimer || gameConnected) return;
    document.body.classList.add('demo');
    const fit = () => document.body.style.setProperty('--demo-scale', Math.min(1, (innerWidth - 40) / 940));
    fit(); addEventListener('resize', fit);

    let t = 0, gear = 1, odo = 1284.3, fuel = 64, health = 1000, blink = false;
    internal(window.setHeadlights, 1);
    internal(window.setSeatbelts, 1);
    internal(window.updateLockStatus, 0);
    demoTimer = setInterval(() => {
        t += 0.05;
        // akselerasi berulang dengan perpindahan gigi
        const phase = (t % 16) / 16;
        const mps = phase < 0.75 ? phase / 0.75 * 62 : (1 - phase) / 0.25 * 62;
        gear = Math.min(6, 1 + Math.floor(mps / 11));
        const inGear = (mps % 11) / 11;
        const rpm = mps < 0.5 ? 0.11 : 0.18 + inGear * 0.72;
        odo += mps * 0.05 / 1609;
        fuel = Math.max(5, fuel - 0.004);
        health = 650 + Math.sin(t / 5) * 350;
        if (Math.floor(t * 2) % 2 === 0) blink = !blink;

        internal(window.setSpeed, mps);
        internal(window.setRPM, rpm);
        internal(window.setGear, mps < 0.5 ? 'N' : gear);
        internal(window.setFuel, fuel);
        internal(window.setHealth, health);
        internal(window.setOdometer, odo);
        const turning = (t % 20) > 14;
        internal(window.setLeftIndicator, turning && blink);
        internal(window.setRightIndicator, false);
        internal(window.setSeatbelts, (t % 30) < 26 ? 1 : 0);
    }, 50);
}
function stopDemo() {
    gameConnected = true;
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    document.body.classList.remove('demo');
}

// Nilai awal & jalankan intro saat HUD pertama dimuat
internal(window.setSpeed, 0);
internal(window.setRPM, 0);
internal(window.setFuel, 1);
internal(window.setHealth, 1000);
window.playIntro();

if (/[?&]demo\b/.test(location.search) || /netlify\.app$/.test(location.hostname)) startDemo();
else setTimeout(() => { if (!gameConnected) startDemo(); }, 5000);
