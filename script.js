const MPS_TO_MPH = 2.236936;
const MAX_MPH = 180;    // skala busur kecepatan
const MAX_RPM = 8;      // skala tachometer (x1000)
const RED_RPM = 7;      // mulai red zone

const $ = (id) => document.getElementById(id);
const elHud = $('hud');
const elSpeed = $('speed-display');
const elGear = $('gear');
const elOdo = $('odometer');
const elRpmVal = $('rpm-val');
const elRpmGauge = $('rpm-gauge');

// ---------- Helper Parser (JGRP) ----------
function isLockedState(val) {
    return val === true || val === 1 || val === "1" || val === "true" || val === 2 || val === "2";
}
function isTrueValue(val) {
    return val === true || val === 1 || val === "1" || val === "true";
}

// ---------- Gauge builder (SVG) ----------
const C = 150, START = 135, SWEEP = 270;
const ang = (v, max) => START + (v / max) * SWEEP;
const pol = (r, a) => {
    const t = (a * Math.PI) / 180;
    return [(C + r * Math.cos(t)).toFixed(2), (C + r * Math.sin(t)).toFixed(2)];
};
function band(r1, r2, a1, a2) {
    const [x1, y1] = pol(r2, a1), [x2, y2] = pol(r2, a2);
    const [x3, y3] = pol(r1, a2), [x4, y4] = pol(r1, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${x1} ${y1}A${r2} ${r2} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}

function buildGauge(svg) {
    let s = `
      <defs>
        <radialGradient id="face-grad" cx="50%" cy="45%" r="60%">
          <stop offset="0" stop-color="#ffd21a"/><stop offset="1" stop-color="#e2b000"/>
        </radialGradient>
      </defs>
      <circle cx="${C}" cy="${C}" r="149" fill="#2a2a30"/>
      <circle cx="${C}" cy="${C}" r="146" fill="#0b0b0d"/>
      <circle cx="${C}" cy="${C}" r="142" fill="url(#face-grad)"/>
      <path class="redzone" d="${band(100, 142, ang(RED_RPM, MAX_RPM), ang(MAX_RPM, MAX_RPM))}" fill="#e5242b"/>`;

    for (let v = 0; v <= MAX_RPM + 1e-6; v += 0.5) {
        const isMajor = Math.abs(v - Math.round(v)) < 1e-6;
        const a = ang(v, MAX_RPM);
        const [x1, y1] = pol(142, a), [x2, y2] = pol(isMajor ? 126 : 134, a);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0b0b0d" stroke-width="${isMajor ? 3 : 1.5}"/>`;
        if (isMajor) {
            const [tx, ty] = pol(113, a);
            const onRed = v >= RED_RPM;
            s += `<text class="tick-label${onRed ? ' on-red' : ''}" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${v}</text>`;
        }
    }

    // jarum (di bawah disc tengah)
    s += `
      <g class="needle" style="transform:rotate(${START + 90}deg)">
        <line x1="${C}" y1="${C + 10}" x2="${C}" y2="14" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
        <line x1="${C}" y1="${C + 10}" x2="${C}" y2="14" stroke="#e5242b" stroke-width="3.5" stroke-linecap="round"/>
      </g>`;

    // disc hitam tengah + busur kecepatan
    const [ax, ay] = pol(90, START), [bx, by] = pol(90, START + SWEEP);
    const arc = `M${ax} ${ay}A90 90 0 1 1 ${bx} ${by}`;
    s += `
      <circle cx="${C}" cy="${C}" r="98" fill="#0b0b0d"/>
      <circle cx="${C}" cy="${C}" r="98" fill="none" stroke="#2b2b31" stroke-width="2"/>
      <path d="${arc}" fill="none" stroke="#26262c" stroke-width="5" stroke-linecap="round"/>
      <path class="speed-arc" d="${arc}" pathLength="100" fill="none" stroke="#f4c400" stroke-width="5"
            stroke-linecap="butt" stroke-dasharray="0 100"/>`;

    svg.innerHTML = s;
    return { needle: svg.querySelector('.needle'), speedArc: svg.querySelector('.speed-arc') };
}

const { needle: rpmNeedle, speedArc } = buildGauge($('rpm-svg'));

function moveNeedle(needle, ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    needle.style.transform = `rotate(${START + r * SWEEP + 90}deg)`;
}
function moveSpeedArc(ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    speedArc.setAttribute('stroke-dasharray', `${(r * 100).toFixed(2)} 100`);
}

// Segmen bar (oil press & fuel)
function buildSegs(id, n) {
    const el = $(id);
    el.innerHTML = '<i class="seg"></i>'.repeat(n);
    return el.querySelectorAll('.seg');
}
const hSegs = buildSegs('health-segments', 10);
const fSegs = buildSegs('fuel-segments', 10);
function fillSegs(segs, percent) {
    const active = Math.round(percent * segs.length);
    segs.forEach((seg, i) => seg.classList.toggle('active', i < active));
}

// ---------- State (disimpan supaya intro tidak menimpa data game) ----------
let introActive = true;
const state = { mph: 0, rpm: 0 };

function renderNeedles() {
    moveSpeedArc(state.mph / MAX_MPH);
    moveNeedle(rpmNeedle, state.rpm);
}

// ---------- 1. Kecepatan ----------
window.setSpeed = function (speed) {
    const mph = Math.round(Number(speed || 0) * MPS_TO_MPH);
    state.mph = mph;
    const padded = String(mph).padStart(3, '0');

    if (mph < 10) {
        elSpeed.innerHTML = `<span class="dim">${padded.slice(0, 2)}</span><span class="bright">${padded.slice(2)}</span>`;
    } else if (mph < 100) {
        elSpeed.innerHTML = `<span class="dim">${padded.slice(0, 1)}</span><span class="bright">${padded.slice(1)}</span>`;
    } else {
        elSpeed.innerHTML = `<span class="bright">${padded}</span>`;
    }
    if (!introActive) moveSpeedArc(mph / MAX_MPH);
};

// ---------- 2. RPM (0.0 - 1.0) ----------
window.setRPM = function (rpm) {
    const val = Math.max(0, Math.min(1, Number(rpm || 0)));
    state.rpm = val;
    elRpmVal.textContent = Math.round(val * MAX_RPM * 1000);
    elRpmGauge.classList.toggle('redline', val >= RED_RPM / MAX_RPM);
    if (!introActive) moveNeedle(rpmNeedle, val);
};

// ---------- 3. Fuel ----------
window.setFuel = function (fuel) {
    const val = Number(fuel || 0);
    const percent = Math.max(0, Math.min(1, val > 1 ? val / 100 : val));
    $('fuel-val').textContent = Math.round(percent * 100);
    fillSegs(fSegs, percent);
};

// ---------- 4. Engine Health (label tampil: OIL PRESS) ----------
window.setHealth = function (health) {
    let val = Number(health || 0);
    let percent = Math.max(0, Math.min(1, val > 1 ? val / 1000 : val));
    $('health-val').textContent = Math.round(percent * 100);
    fillSegs(hSegs, percent);

    const engineIcon = $('engine-icon');
    if (engineIcon) {
        engineIcon.className = 'stat-icon';
        if (percent <= 0.25) engineIcon.classList.add('active-danger');
        else if (percent <= 0.50) engineIcon.classList.add('active-warn');
    }
};

// ---------- 5. Gear ----------
window.setGear = function (gear) {
    elGear.innerText = (gear == 0 || gear === "0") ? 'R' : String(gear);
};

// ---------- 6. Lock / Unlock ----------
window.updateLockStatus = function (state) {
    const el = $('door-lock');
    if (el) el.className = isLockedState(state) ? 'icon-item tile locked' : 'icon-item tile';
};
window.setDoors = window.updateLockStatus;
window.setDoorLock = window.updateLockStatus;
window.setVehicleLocked = window.updateLockStatus;
window.setLocked = window.updateLockStatus;
window.setLock = window.updateLockStatus;
window.toggleLock = window.updateLockStatus;

// ---------- 7. Lampu ----------
window.setHeadlights = function (state) {
    const low = $('headlight-low');
    const high = $('headlight-high');
    const val = Number(state || 0);
    if (low) low.className = (val === 1) ? 'icon-item tile active' : 'icon-item tile';
    if (high) high.className = (val === 2) ? 'icon-item tile high-beam' : 'icon-item tile';
};

// ---------- 8. Sein ----------
window.setLeftIndicator = function (state) {
    const el = $('indicator-left');
    if (el) el.className = isTrueValue(state) ? 'icon-item arrow active' : 'icon-item arrow';
};
window.setRightIndicator = function (state) {
    const el = $('indicator-right');
    if (el) el.className = isTrueValue(state) ? 'icon-item arrow active' : 'icon-item arrow';
};

// ---------- 9. Seatbelt ----------
window.setSeatbelts = function (state) {
    const el = $('seatbelts');
    if (el) el.className = isTrueValue(state) ? 'icon-item tile active' : 'icon-item tile warn';
};

// ---------- 10. Odometer ----------
window.setOdometer = function (distance) {
    if (elOdo) elOdo.innerText = `${Number(distance || 0).toFixed(1)} mi`;
};

// ---------- Intro: siluet mobil + tes jarum ----------
window.playIntro = function () {
    const intro = $('intro');
    introActive = true;
    elHud.classList.add('sweeping');

    // restart animasi CSS & SMIL
    intro.classList.remove('done');
    intro.style.animation = 'none';
    intro.querySelectorAll('.stage, .beam').forEach((e) => { e.style.animation = 'none'; });
    void intro.offsetWidth;
    intro.style.animation = '';
    intro.querySelectorAll('.stage, .beam').forEach((e) => { e.style.animation = ''; });
    const anim = $('scan-anim');
    if (anim && anim.beginElement) anim.beginElement();

    moveSpeedArc(0);
    moveNeedle(rpmNeedle, 0);

    setTimeout(() => { moveSpeedArc(1); moveNeedle(rpmNeedle, 1); }, 2800); // jarum naik
    setTimeout(() => { moveSpeedArc(0); moveNeedle(rpmNeedle, 0); }, 3700); // jarum turun
    setTimeout(() => {
        intro.classList.add('done');
        elHud.classList.remove('sweeping');
        introActive = false;
        renderNeedles();                                                    // pakai data game terbaru
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

// Nilai awal & jalankan intro saat HUD pertama dimuat
window.setSpeed(0);
window.setRPM(0);
window.playIntro();
