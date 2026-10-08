const MPS_TO_MPH = 2.236936;
const MPS_TO_KMH = 3.6;
const MAX_RPM = 9;       // skala tachometer (x1000)
const RED_RPM = 6;       // mulai red zone
const BLINK_RPM = 8;     // red zone berkedip di atas ini

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
const C = 150, START = 90, SWEEP = 315;   // 0 di bawah, 3 di kiri, 6 di atas, 9 di kanan-bawah
const ang = (v) => START + (v / MAX_RPM) * SWEEP;
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
      <circle cx="${C}" cy="${C}" r="149" fill="#26262b"/>
      <circle cx="${C}" cy="${C}" r="146" fill="#000"/>
      <circle cx="${C}" cy="${C}" r="141" fill="url(#face-grad)"/>
      <path class="redzone" d="${band(86, 141, ang(RED_RPM), ang(MAX_RPM))}" fill="#e5242b"/>`;

    for (let v = 0; v <= MAX_RPM + 1e-6; v += 0.5) {
        const isMajor = Math.abs(v - Math.round(v)) < 1e-6;
        const a = ang(v);
        const [x1, y1] = pol(141, a), [x2, y2] = pol(isMajor ? 124 : 133, a);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0b0b0d" stroke-width="${isMajor ? 3 : 1.6}"/>`;
        if (isMajor) {
            const [tx, ty] = pol(107, a);
            const onRed = v >= RED_RPM;
            s += `<text class="tick-label${onRed ? ' on-red' : ''}" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${v}</text>`;
        }
    }

    // disc hitam tengah
    s += `
      <circle cx="${C}" cy="${C}" r="86" fill="#0b0b0d"/>
      <circle cx="${C}" cy="${C}" r="86" fill="none" stroke="#3a3a42" stroke-width="2"/>`;

    // jarum (di atas disc, di bawah panel digital HTML)
    s += `
      <g class="needle" style="transform:rotate(${START + 90}deg)">
        <line x1="${C}" y1="${C + 18}" x2="${C}" y2="20" stroke="#000" stroke-width="7" stroke-linecap="round"/>
        <line x1="${C}" y1="${C + 18}" x2="${C}" y2="21" stroke="#e5242b" stroke-width="4" stroke-linecap="round"/>
      </g>
      <circle cx="${C}" cy="${C}" r="10" fill="#17171b" stroke="#e5242b" stroke-width="3"/>`;

    svg.innerHTML = s;
    return svg.querySelector('.needle');
}

const rpmNeedle = buildGauge($('rpm-svg'));

function moveNeedle(needle, ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    needle.style.transform = `rotate(${START + r * SWEEP + 90}deg)`;
}

// ---------- State (disimpan supaya intro tidak menimpa data game) ----------
let introActive = true;
const state = { rpm: 0 };

// ---------- 1. Kecepatan ----------
window.setSpeed = function (speed) {
    const mps = Number(speed || 0);
    const mph = Math.round(mps * MPS_TO_MPH);
    const padded = String(mph).padStart(3, '0');

    if (mph < 10) {
        elSpeed.innerHTML = `<span class="dim">${padded.slice(0, 2)}</span><span class="bright">${padded.slice(2)}</span>`;
    } else if (mph < 100) {
        elSpeed.innerHTML = `<span class="dim">${padded.slice(0, 1)}</span><span class="bright">${padded.slice(1)}</span>`;
    } else {
        elSpeed.innerHTML = `<span class="bright">${padded}</span>`;
    }
    $('kmh-val').textContent = Math.round(mps * MPS_TO_KMH);
};

// ---------- 2. RPM (0.0 - 1.0) ----------
window.setRPM = function (rpm) {
    const val = Math.max(0, Math.min(1, Number(rpm || 0)));
    state.rpm = val;
    elRpmVal.textContent = Math.round(val * MAX_RPM * 1000);
    elRpmGauge.classList.toggle('redline', val >= BLINK_RPM / MAX_RPM);
    if (!introActive) moveNeedle(rpmNeedle, val);
};

// ---------- 3. Fuel ----------
window.setFuel = function (fuel) {
    const val = Number(fuel || 0);
    const percent = Math.max(0, Math.min(1, val > 1 ? val / 100 : val));
    $('fuel-val').textContent = Math.round(percent * 100);
    const tile = $('tile-fuel');
    if (tile) {
        tile.classList.toggle('danger', percent <= 0.15);
        tile.classList.toggle('warn', percent > 0.15 && percent <= 0.30);
    }
};

// ---------- 4. Engine Health (label tampil: OIL PRESS) ----------
window.setHealth = function (health) {
    let val = Number(health || 0);
    let percent = Math.max(0, Math.min(1, val > 1 ? val / 1000 : val));
    $('health-val').textContent = Math.round(percent * 100);

    const tile = $('tile-oil');
    if (tile) {
        tile.classList.toggle('danger', percent <= 0.25);
        tile.classList.toggle('warn', percent > 0.25 && percent <= 0.50);
    }

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

// ---------- 6. Lock / Unlock Vehicle (Mendukung semua alternatif panggilan JGRP) ----------
let lockedNow = false;
window.updateLockStatus = function (state) {
    const el = $('door-lock');
    if (!el) return;

    // dipanggil tanpa argumen (mis. toggleLock()) -> balik status
    const locked = (state === undefined) ? !lockedNow : isLockedState(state);
    lockedNow = locked;

    if (locked) {
        el.className = 'icon-item tile locked';   // Nyala kuning (Terkunci)
    } else {
        el.className = 'icon-item tile';          // Mati (Terbuka)
    }
};
[
    'setDoors', 'setDoorLock', 'setDoorsLocked', 'setVehicleLocked', 'setVehicleLock',
    'setLocked', 'setLock', 'toggleLock', 'updateLock', 'lockVehicle', 'setCarLock'
].forEach((name) => { window[name] = window.updateLockStatus; });

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
    if (!elOdo) return;
    const text = Number(distance || 0).toFixed(1);
    elOdo.textContent = text;
    elOdo.classList.toggle('sm', text.length > 6);   // kecilkan font kalau angkanya panjang
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

    moveNeedle(rpmNeedle, 0);

    setTimeout(() => moveNeedle(rpmNeedle, 1), 2800);   // jarum naik
    setTimeout(() => moveNeedle(rpmNeedle, 0), 3700);   // jarum turun
    setTimeout(() => {
        intro.classList.add('done');
        elHud.classList.remove('sweeping');
        introActive = false;
        moveNeedle(rpmNeedle, state.rpm);               // pakai data game terbaru
    }, 4600);
};

// ---------- Message handler ----------
window.addEventListener('message', function (event) {
    if (!event.data) return;
    const data = event.data;
    const t = data.type || data.action;
    if (['setDoors', 'lock', 'setLock', 'setLocked', 'updateLockStatus', 'setDoorLock'].includes(t)) {
        const v = data.status !== undefined ? data.status
                : data.state !== undefined ? data.state
                : data.locked !== undefined ? data.locked
                : data.value;
        window.updateLockStatus(v);
    }
    if (t === 'playIntro') window.playIntro();
});

// Nilai awal & jalankan intro saat HUD pertama dimuat
window.setSpeed(0);
window.setRPM(0);
window.playIntro();
