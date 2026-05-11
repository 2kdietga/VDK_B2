const cv = document.querySelector("#cv");
const cx = cv.getContext("2d");
const W = 640;
const H = 320;
const GROUND = H - 40;
const PW = 22;
const PH = 30;
const keys = {};
const holdKeys = new Set();
const poll = {
    inputVersion: 0,
    lastAt: 0,
    gesture: "dung_yen",
};

let score = 0;
let wave = 1;
let hp = 100;
let maxHp = 100;
let gameOver = false;
let paused = false;
let menuIndex = 0;
let waveMsg = 0;
let waveMsgText = "";
let atkCd = 0;
let invincible = 0;
let shakePwr = 0;
let shX = 0;
let shY = 0;
let bullets = [];
let enemies = [];
let particles = [];
let floats = [];
let spawnQueue = [];
let spawnTimer = 0;
let waveActive = false;
let betweenWave = 0;

const player = {
    x: 80,
    y: GROUND - PH / 2,
    facing: 1,
    atkFrame: 0,
    walkF: 0,
    walkT: 0,
};

const pauseMenu = document.querySelector("#pauseMenu");
const pauseButtons = Array.from(document.querySelectorAll("[data-menu-action]"));

function updateHUD() {
    const pct = Math.max(0, (hp / maxHp) * 100);
    const hpFill = document.querySelector("#hpfill");
    hpFill.style.width = `${pct}%`;
    hpFill.style.background = pct > 50 ? "#3fb950" : pct > 25 ? "#f0c040" : "#f85149";
    document.querySelector("#hptxt").textContent = Math.max(0, Math.round(hp));
    document.querySelector("#wavetxt").textContent = `Sóng ${wave}`;
    document.querySelector("#sctxt").textContent = `${score} điểm`;
}

function buildWave(n) {
    spawnQueue = [];
    const count = Math.min(2 + (n - 1), 5);
    for (let i = 0; i < count; i += 1) {
        if (n >= 4 && i === count - 1) {
            spawnQueue.push("tank");
        } else if (n >= 3 && i % 3 === 2) {
            spawnQueue.push("runner");
        } else {
            spawnQueue.push("walker");
        }
    }
    spawnTimer = 120;
    waveActive = true;
}

function spawnEnemy(type) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const sx = side === 1 ? W + 20 : -20;
    const cfg = {
        walker: { hp: 2, spd: 0.55, w: 18, h: 26, col: "#f85149", pts: 10 },
        runner: { hp: 2, spd: 1.1, w: 16, h: 22, col: "#ff7b72", pts: 20 },
        tank: { hp: 5, spd: 0.35, w: 26, h: 34, col: "#da3633", pts: 40 },
    };
    const c = cfg[type];
    enemies.push({
        x: sx,
        y: GROUND - c.h / 2,
        vx: -side * c.spd,
        w: c.w,
        h: c.h,
        hp: c.hp,
        maxHp: c.hp,
        col: c.col,
        pts: c.pts,
        type,
        facing: -side,
        walkF: 0,
        walkT: 0,
        hitF: 0,
    });
}

function spawnPfx(x, y, col, n) {
    for (let i = 0; i < n; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 2.5;
        particles.push({
            x,
            y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: 22 + Math.random() * 12,
            col,
            sz: 2 + Math.random() * 2.5,
        });
    }
}

function spawnFloat(x, y, txt, col) {
    floats.push({ x, y, vy: -1, life: 55, txt, col });
}

function doAttack() {
    if (atkCd > 0 || paused) {
        return;
    }
    atkCd = 16;
    player.atkFrame = 11;
    const bx = player.x + player.facing * 14;
    bullets.push({ x: bx, y: player.y, vx: player.facing * 9, life: 30 });
    spawnPfx(bx, player.y, "#f0c040", 3);
}

function drawBg() {
    cx.fillStyle = "#0d1117";
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#161b22";
    cx.fillRect(0, GROUND, W, H - GROUND);
    cx.fillStyle = "#21262d";
    cx.fillRect(0, GROUND, W, 2);
    for (let i = 0; i < W; i += 60) {
        cx.fillStyle = "#21262d";
        cx.fillRect(i + 10, GROUND - 4, 20, 4);
    }
}

function drawPlayer() {
    const { x, y, facing, atkFrame, walkF } = player;
    if (invincible > 0 && Math.floor(invincible / 4) % 2) {
        return;
    }
    cx.save();
    cx.translate(x, y);
    cx.scale(facing, 1);
    cx.fillStyle = "#388bfd";
    cx.fillRect(-PW / 2, -PH / 2, PW, PH * 0.55);
    cx.fillStyle = "#1f6feb";
    const l = walkF === 0 ? 3 : -3;
    cx.fillRect(-PW / 2, -PH / 2 + PH * 0.55, (PW / 2) * 0.9, PH * 0.45 + l);
    cx.fillRect((PW / 2) * 0.1, -PH / 2 + PH * 0.55, (PW / 2) * 0.9, PH * 0.45 - l);
    cx.fillStyle = "#ffdcd7";
    cx.fillRect((-PW / 2) * 0.7, -PH / 2 - PH * 0.28, PW * 0.7, PH * 0.28);
    cx.fillStyle = "#1c2128";
    cx.fillRect((-PW / 2) * 0.15, -PH / 2 - PH * 0.2, PW * 0.14, PH * 0.1);
    cx.fillRect((PW / 2) * 0.15, -PH / 2 - PH * 0.2, PW * 0.14, PH * 0.1);
    if (atkFrame > 0) {
        cx.fillStyle = "#f0c040";
        cx.shadowColor = "#f0c040";
        cx.shadowBlur = 6;
        cx.fillRect(PW / 2, -PH / 2, 5, PH * 0.45);
        cx.fillStyle = "rgba(240,192,64,0.35)";
        cx.fillRect(PW / 2, (-PH / 2) * 0.2, 30 * (1 - atkFrame / 11), PH * 0.25);
        cx.shadowBlur = 0;
    } else {
        cx.fillStyle = "#8b949e";
        cx.fillRect(PW / 2, -PH / 2 + PH * 0.1, 4, PH * 0.35);
    }
    cx.restore();
}

function drawEnemy(e) {
    const { x, y, w, h, col, facing, walkF, hitF } = e;
    cx.save();
    cx.translate(x, y);
    cx.scale(facing, 1);
    cx.fillStyle = hitF > 0 ? "#fff" : col;
    cx.fillRect(-w / 2, -h / 2, w, h * 0.55);
    cx.fillStyle = hitF > 0 ? "#fff" : `${col}99`;
    const l = walkF === 0 ? 2 : -2;
    cx.fillRect(-w / 2, -h / 2 + h * 0.55, (w / 2) * 0.9, h * 0.45 + l);
    cx.fillRect((w / 2) * 0.1, -h / 2 + h * 0.55, (w / 2) * 0.9, h * 0.45 - l);
    cx.fillStyle = hitF > 0 ? "#fff" : "#ffdcd7";
    cx.fillRect((-w / 2) * 0.7, -h / 2 - h * 0.26, w * 0.7, h * 0.26);
    cx.fillStyle = "#1c2128";
    cx.fillRect((-w / 2) * 0.2, -h / 2 - h * 0.19, w * 0.13, h * 0.1);
    cx.fillRect((w / 2) * 0.07, -h / 2 - h * 0.19, w * 0.13, h * 0.1);
    cx.restore();
    const bw = w + 8;
    cx.fillStyle = "#21262d";
    cx.fillRect(x - bw / 2, y - h / 2 - 10, bw, 4);
    cx.fillStyle = e.hp / e.maxHp > 0.5 ? "#3fb950" : "#f85149";
    cx.fillRect(x - bw / 2, y - h / 2 - 10, bw * (e.hp / e.maxHp), 4);
}

function update() {
    if (gameOver || paused) {
        return;
    }
    atkCd = Math.max(0, atkCd - 1);
    invincible = Math.max(0, invincible - 1);
    if (player.atkFrame > 0) {
        player.atkFrame -= 1;
    }
    if (waveMsg > 0) {
        waveMsg -= 1;
    }
    if (shakePwr > 0) {
        shX = (Math.random() - 0.5) * shakePwr;
        shY = (Math.random() - 0.5) * shakePwr;
        shakePwr = Math.max(0, shakePwr - 1);
    } else {
        shX = 0;
        shY = 0;
    }

    let dx = 0;
    let dy = 0;
    if (keys.ArrowLeft || keys.a || keys.A) dx -= 3;
    if (keys.ArrowRight || keys.d || keys.D) dx += 3;
    if (keys.ArrowUp || keys.w || keys.W) dy -= 3;
    if (keys.ArrowDown || keys.s || keys.S) dy += 3;
    if (keys[" "] || keys.j || keys.J) doAttack();

    if (dx !== 0) {
        player.facing = dx > 0 ? 1 : -1;
    }
    if (dx !== 0 || dy !== 0) {
        player.walkT += 1;
        if (player.walkT > 9) {
            player.walkT = 0;
            player.walkF ^= 1;
        }
    } else {
        player.walkF = 0;
    }
    player.x = Math.max(PW / 2, Math.min(W - PW / 2, player.x + dx));
    player.y = Math.max(40, Math.min(GROUND - PH / 2, player.y + dy));

    if (waveActive) {
        spawnTimer -= 1;
        if (spawnTimer <= 0 && spawnQueue.length > 0) {
            spawnEnemy(spawnQueue.shift());
            spawnTimer = 180;
        }
    }

    if (waveActive && spawnQueue.length === 0 && enemies.length === 0) {
        waveActive = false;
        betweenWave = 200;
        waveMsgText = `Sóng ${wave} xong! +25 HP`;
        waveMsg = 110;
    }
    if (!waveActive && betweenWave > 0) {
        betweenWave -= 1;
        if (betweenWave === 0) {
            wave += 1;
            hp = Math.min(maxHp, hp + 25);
            updateHUD();
            buildWave(wave);
            waveMsgText = `Sóng ${wave}!`;
            waveMsg = 90;
        }
    }

    bullets = bullets.filter((b) => {
        b.x += b.vx;
        b.life -= 1;
        if (b.life <= 0 || b.x < 0 || b.x > W) return false;
        for (const e of enemies) {
            if (Math.abs(b.x - e.x) < e.w / 2 + 4 && Math.abs(b.y - e.y) < e.h / 2 + 4) {
                e.hp -= 1;
                e.hitF = 7;
                spawnPfx(e.x, e.y, e.col, 5);
                spawnFloat(e.x, e.y - 15, "-1", "#f0c040");
                if (e.hp <= 0) {
                    score += e.pts;
                    spawnPfx(e.x, e.y, e.col, 12);
                    spawnFloat(e.x, e.y - 25, `+${e.pts}`, "#3fb950");
                    enemies.splice(enemies.indexOf(e), 1);
                    updateHUD();
                }
                return false;
            }
        }
        return true;
    });

    enemies.forEach((e) => {
        e.hitF = Math.max(0, e.hitF - 1);
        e.x += e.vx;
        if (e.x < e.w / 2) {
            e.x = e.w / 2;
            e.vx *= -1;
            e.facing *= -1;
        }
        if (e.x > W - e.w / 2) {
            e.x = W - e.w / 2;
            e.vx *= -1;
            e.facing *= -1;
        }
        e.y = GROUND - e.h / 2;
        e.walkT += 1;
        if (e.walkT > 9) {
            e.walkT = 0;
            e.walkF ^= 1;
        }
        if (
            invincible === 0 &&
            Math.abs(e.x - player.x) < (e.w / 2 + PW / 2) * 0.8 &&
            Math.abs(e.y - player.y) < (e.h / 2 + PH / 2) * 0.8
        ) {
            const dmg = e.type === "tank" ? 10 : 6;
            hp -= dmg;
            invincible = 65;
            shakePwr = 8;
            spawnFloat(player.x, player.y - 25, `-${dmg}`, "#f85149");
            if (hp <= 0) {
                hp = 0;
                gameOver = true;
            }
            updateHUD();
        }
    });

    particles = particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.life -= 1;
        return p.life > 0;
    });
    floats = floats.filter((f) => {
        f.y += f.vy;
        f.life -= 1;
        return f.life > 0;
    });
}

function draw() {
    cx.clearRect(0, 0, W, H);
    cx.save();
    cx.translate(shX, shY);
    drawBg();
    bullets.forEach((b) => {
        cx.save();
        cx.shadowColor = "#f0c040";
        cx.shadowBlur = 8;
        cx.fillStyle = "#f0c040";
        cx.fillRect(b.x - 8, b.y - 3, 16, 6);
        cx.shadowBlur = 0;
        cx.restore();
    });
    enemies.forEach((e) => drawEnemy(e));
    drawPlayer();
    particles.forEach((p) => {
        cx.globalAlpha = p.life / 35;
        cx.fillStyle = p.col;
        cx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    });
    cx.globalAlpha = 1;
    floats.forEach((f) => {
        cx.globalAlpha = f.life / 55;
        cx.fillStyle = f.col;
        cx.font = "bold 13px Courier New";
        cx.textAlign = "center";
        cx.fillText(f.txt, f.x, f.y);
    });
    cx.globalAlpha = 1;

    if (!waveActive && betweenWave > 0) {
        const prog = betweenWave / 200;
        cx.fillStyle = "rgba(13,17,23,0.6)";
        cx.fillRect(W / 2 - 160, H / 2 - 30, 320, 60);
        cx.fillStyle = "#3fb950";
        cx.font = "bold 17px Courier New";
        cx.textAlign = "center";
        cx.fillText(waveMsgText, W / 2, H / 2 - 6);
        cx.fillStyle = "#8b949e";
        cx.font = "13px Courier New";
        cx.fillText(`Tiếp theo sau ${Math.ceil(betweenWave / 60)} giây...`, W / 2, H / 2 + 16);
        cx.fillStyle = "#21262d";
        cx.fillRect(W / 2 - 80, H / 2 + 28, 160, 4);
        cx.fillStyle = "#388bfd";
        cx.fillRect(W / 2 - 80, H / 2 + 28, 160 * prog, 4);
    }

    if (waveMsg > 0 && waveActive) {
        cx.globalAlpha = Math.min(1, waveMsg / 25);
        cx.fillStyle = "rgba(13,17,23,0.65)";
        cx.fillRect(W / 2 - 110, H / 2 - 24, 220, 44);
        cx.fillStyle = "#f0c040";
        cx.font = "bold 22px Courier New";
        cx.textAlign = "center";
        cx.fillText(waveMsgText, W / 2, H / 2 + 8);
        cx.globalAlpha = 1;
    }

    if (waveActive && spawnQueue.length > 0) {
        cx.fillStyle = "#8b949e";
        cx.font = "12px Courier New";
        cx.textAlign = "right";
        cx.fillText(`Còn ${spawnQueue.length} kẻ thù sắp ra`, W - 10, 18);
    }

    if (gameOver) {
        cx.fillStyle = "rgba(0,0,0,0.75)";
        cx.fillRect(0, 0, W, H);
        cx.fillStyle = "#f85149";
        cx.font = "bold 34px Courier New";
        cx.textAlign = "center";
        cx.fillText("GAME OVER", W / 2, H / 2 - 20);
        cx.fillStyle = "#8b949e";
        cx.font = "15px Courier New";
        cx.fillText(`Sóng ${wave} · ${score} điểm  |  Nhấn R / OK để chơi lại`, W / 2, H / 2 + 18);
    }

    if (paused) {
        cx.fillStyle = "rgba(0,0,0,0.45)";
        cx.fillRect(0, 0, W, H);
    }
    cx.restore();
}

function restart() {
    score = 0;
    wave = 1;
    hp = 100;
    maxHp = 100;
    gameOver = false;
    paused = false;
    menuIndex = 0;
    waveActive = false;
    betweenWave = 0;
    bullets = [];
    enemies = [];
    particles = [];
    floats = [];
    spawnQueue = [];
    player.x = 80;
    player.y = GROUND - PH / 2;
    player.facing = 1;
    invincible = 0;
    atkCd = 0;
    shakePwr = 0;
    buildWave(1);
    waveMsgText = "Sóng 1!";
    waveMsg = 80;
    updateHUD();
    renderMenu();
}

function loop(now) {
    if (now - poll.lastAt > 80) {
        poll.lastAt = now;
        pollState();
    }
    update();
    draw();
    requestAnimationFrame(loop);
}

function setHoldKey(key, value) {
    keys[key] = value;
    if (value) {
        holdKeys.add(key);
    } else {
        holdKeys.delete(key);
    }
}

function clearGestureKeys() {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        if (!holdKeys.has(key)) {
            keys[key] = false;
        }
    }
}

function applyGesture(gesture) {
    clearGestureKeys();
    if (gesture === "len") keys.ArrowUp = true;
    if (gesture === "xuong") keys.ArrowDown = true;
    if (gesture === "trai") keys.ArrowLeft = true;
    if (gesture === "phai") keys.ArrowRight = true;
}

async function pollState() {
    try {
        const response = await fetch("/api/state/", { cache: "no-store" });
        const data = await response.json();
        if (data.screen !== "game") {
            window.location.href = "/";
            return;
        }

        poll.gesture = data.esp32_online ? data.gesture || "dung_yen" : "dung_yen";
        applyGesture(poll.gesture);

        if (Number(data.input_version || 0) !== poll.inputVersion) {
            poll.inputVersion = Number(data.input_version || 0);
            handleInputEvent(data);
        }
    } catch (error) {
        document.querySelector("#info").textContent = "Mất kết nối server · vẫn có thể chơi bằng bàn phím";
    }
}

function handleInputEvent(data) {
    if (data.btn_menu) {
        togglePause(true);
        return;
    }

    if (paused) {
        if (data.gesture === "len" || data.gesture === "xuong") {
            menuIndex = (menuIndex + 1) % pauseButtons.length;
            renderMenu();
        }
        if (data.btn_ok) {
            selectMenu();
        }
        return;
    }

    if (data.btn_ok) {
        if (gameOver) {
            restart();
        } else {
            doAttack();
        }
    }
}

function togglePause(forceValue) {
    paused = typeof forceValue === "boolean" ? forceValue : !paused;
    renderMenu();
}

function renderMenu() {
    pauseMenu.classList.toggle("hidden", !paused);
    pauseButtons.forEach((button, index) => {
        button.classList.toggle("active", index === menuIndex);
    });
}

function selectMenu() {
    const action = pauseButtons[menuIndex].dataset.menuAction;
    if (action === "continue") {
        togglePause(false);
    } else {
        goDashboard();
    }
}

async function sendInput(input) {
    const response = await fetch("/api/input/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    }).catch(() => null);
    return response ? response.json().catch(() => null) : null;
}

function goDashboard() {
    fetch("/api/dashboard-state/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screen: "dashboard", active_control: "led" }),
    }).finally(() => {
        window.location.href = "/";
    });
}

document.addEventListener("keydown", (e) => {
    const key = e.key;
    const lower = key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "enter", " ", "j", "m", "escape", "r"].includes(lower)) {
        e.preventDefault();
    }

    if (lower === "m" || lower === "escape") {
        togglePause();
        if (paused) {
            sendInput({ btn_menu: true });
        }
        return;
    }

    if (paused) {
        if (lower === "arrowup" || lower === "arrowdown" || lower === "w" || lower === "s") {
            menuIndex = (menuIndex + 1) % pauseButtons.length;
            renderMenu();
        } else if (lower === "enter" || lower === " ") {
            selectMenu();
        }
        return;
    }

    keys[key] = true;
    if (key.startsWith("Arrow")) {
        holdKeys.add(key);
    }
    if (lower === "r") restart();
    if (lower === " " || lower === "j") doAttack();
});

document.addEventListener("keyup", (e) => {
    keys[e.key] = false;
    if (e.key.startsWith("Arrow")) {
        holdKeys.delete(e.key);
    }
});

function hold(id, key) {
    const b = document.querySelector(`#${id}`);
    b.addEventListener("pointerdown", () => {
        setHoldKey(key, true);
        b.classList.add("on");
        sendInput({ state: key.replace("Arrow", "").toLowerCase() });
    });
    const release = () => {
        setHoldKey(key, false);
        b.classList.remove("on");
        sendInput({ state: "idle" });
    };
    b.addEventListener("pointerup", release);
    b.addEventListener("pointerleave", release);
    b.addEventListener("pointercancel", release);
}

hold("bU", "ArrowUp");
hold("bD", "ArrowDown");
hold("bL", "ArrowLeft");
hold("bR", "ArrowRight");

document.querySelector("#bA").addEventListener("pointerdown", () => {
    if (gameOver) {
        restart();
    } else {
        doAttack();
    }
    sendInput({ btn_ok: true });
});

document.querySelector("#bM").addEventListener("click", () => {
    togglePause();
    if (paused) {
        sendInput({ btn_menu: true });
    }
});

pauseButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
        menuIndex = index;
        selectMenu();
    });
});

restart();
requestAnimationFrame(loop);
