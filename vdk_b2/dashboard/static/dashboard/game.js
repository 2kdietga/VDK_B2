const arena = document.querySelector("#arena");
const playerEl = document.querySelector("#player");
const enemyEl = document.querySelector("#enemy");
const slashEl = document.querySelector("#slash");
const lostOverlay = document.querySelector("#lostOverlay");
const pauseMenu = document.querySelector("#pauseMenu");
const menuItems = Array.from(document.querySelectorAll(".menu-item"));
const gamePadButtons = Array.from(document.querySelectorAll("[data-game-input]"));
const hpLabel = document.querySelector("#hpLabel");
const enemyLabel = document.querySelector("#enemyLabel");
const scoreLabel = document.querySelector("#scoreLabel");

const world = {
    width: 960,
    height: 520,
    ground: 392,
    gesture: "dung_yen",
    inputVersion: 0,
    lastPollAt: 0,
    lastFrame: performance.now(),
};

const game = {
    status: "playing",
    paused: false,
    menuIndex: 0,
    hp: 5,
    score: 0,
    player: {
        x: 140,
        y: 392,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: true,
        crouch: false,
        attackTimer: 0,
        jumpLatch: false,
    },
    enemy: {
        x: 760,
        y: 392,
        hp: 4,
        vx: 0,
        hitTimer: 0,
        attackCooldown: 0,
    },
};

function resetGame() {
    game.status = "playing";
    game.paused = false;
    game.menuIndex = 0;
    game.hp = 5;
    game.score = 0;
    Object.assign(game.player, {
        x: 140,
        y: world.ground,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: true,
        crouch: false,
        attackTimer: 0,
        jumpLatch: false,
    });
    Object.assign(game.enemy, {
        x: 760,
        y: world.ground,
        hp: 4,
        vx: 0,
        hitTimer: 0,
        attackCooldown: 0,
    });
}

async function sendInput(input) {
    const response = await fetch("/api/input/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    }).catch(() => null);

    return response ? response.json().catch(() => null) : null;
}

async function pollState() {
    try {
        const response = await fetch("/api/state/", { cache: "no-store" });
        const data = await response.json();

        if (data.screen !== "game") {
            window.location.href = "/";
            return;
        }

        world.gesture = data.gesture || "dung_yen";

        if (Number(data.input_version || 0) !== world.inputVersion) {
            world.inputVersion = Number(data.input_version || 0);
            handleInputEvent(data);
        }
    } catch (error) {
        hpLabel.textContent = "Mất kết nối";
    }
}

function handleInputEvent(data) {
    if (data.btn_menu) {
        game.paused = true;
        return;
    }

    if (game.paused) {
        if (data.gesture === "len" || data.gesture === "xuong") {
            game.menuIndex = (game.menuIndex + 1) % 2;
        }

        if (data.btn_ok) {
            if (game.menuIndex === 0) {
                game.paused = false;
            } else {
                goDashboard();
            }
        }
        return;
    }

    if (game.status === "lost") {
        if (data.btn_ok) {
            resetGame();
        }
        return;
    }

    if (data.btn_ok) {
        attack();
    }
}

function attack() {
    game.player.attackTimer = 0.22;
    const dx = game.enemy.x - game.player.x;
    const ahead = dx * game.player.facing >= 0;
    const close = Math.abs(dx) < 104 && Math.abs(game.enemy.y - game.player.y) < 86;

    if (ahead && close) {
        game.enemy.hp -= 1;
        game.enemy.hitTimer = 0.18;
        if (game.enemy.hp <= 0) {
            game.score += 1;
            game.enemy.hp = 3 + Math.min(4, Math.floor(game.score / 3));
            game.enemy.x = game.player.x < world.width / 2 ? world.width - 90 : 90;
            game.enemy.attackCooldown = 0.7;
        }
    }
}

function update(dt) {
    if (game.paused || game.status === "lost") {
        return;
    }

    const player = game.player;
    const enemy = game.enemy;
    const speed = player.crouch ? 145 : 295;

    player.vx = 0;
    if (world.gesture === "trai") {
        player.vx = -speed;
        player.facing = -1;
    } else if (world.gesture === "phai") {
        player.vx = speed;
        player.facing = 1;
    }

    if (world.gesture === "len" && player.onGround && !player.jumpLatch) {
        player.vy = -620;
        player.onGround = false;
        player.jumpLatch = true;
    }

    if (world.gesture !== "len") {
        player.jumpLatch = false;
    }

    player.crouch = world.gesture === "xuong" && player.onGround;
    if (world.gesture === "xuong" && !player.onGround) {
        player.vy += 1300 * dt;
    }

    player.vy += 1550 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 45, world.width - 45);

    const groundAtPlayer = groundHeightAt(player.x);
    if (player.y >= groundAtPlayer) {
        player.y = groundAtPlayer;
        player.vy = 0;
        player.onGround = true;
    } else {
        player.onGround = false;
    }

    player.attackTimer = Math.max(0, player.attackTimer - dt);

    const enemyGround = groundHeightAt(enemy.x);
    enemy.y = enemyGround;
    enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

    const distance = player.x - enemy.x;
    if (Math.abs(distance) > 42) {
        enemy.vx = Math.sign(distance) * 120;
        enemy.x += enemy.vx * dt;
    } else if (enemy.attackCooldown <= 0) {
        game.hp -= 1;
        enemy.attackCooldown = 0.85;
        if (game.hp <= 0) {
            game.status = "lost";
        }
    }
}

function render() {
    const player = game.player;
    const enemy = game.enemy;

    playerEl.style.left = `${player.x}px`;
    playerEl.style.top = `${player.y - 94}px`;
    playerEl.classList.toggle("left", player.facing < 0);
    playerEl.classList.toggle("running", Math.abs(player.vx) > 1);
    playerEl.classList.toggle("jumping", !player.onGround);
    playerEl.classList.toggle("crouch", player.crouch);

    enemyEl.style.left = `${enemy.x}px`;
    enemyEl.style.top = `${enemy.y - 94}px`;
    enemyEl.classList.toggle("hurt", enemy.hitTimer > 0);

    slashEl.classList.toggle("hidden", player.attackTimer <= 0);
    slashEl.style.left = `${player.x + player.facing * 58}px`;
    slashEl.style.top = `${player.y - 104}px`;
    slashEl.classList.toggle("left", player.facing < 0);

    lostOverlay.classList.toggle("hidden", game.status !== "lost");
    pauseMenu.classList.toggle("hidden", !game.paused);
    menuItems.forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.gameMenuIndex) === game.menuIndex);
    });

    hpLabel.textContent = `HP ${game.hp}`;
    enemyLabel.textContent = `Quái ${enemy.hp}`;
    scoreLabel.textContent = `Điểm ${game.score}`;
}

function loop(now) {
    const dt = Math.min(0.033, (now - world.lastFrame) / 1000);
    world.lastFrame = now;

    if (now - world.lastPollAt > 70) {
        world.lastPollAt = now;
        pollState();
    }

    update(dt);
    render();
    requestAnimationFrame(loop);
}

function groundHeightAt(x) {
    return world.ground - Math.sin(x / 88) * 14 - Math.sin(x / 37) * 5;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s", "enter", " ", "m", "escape"].includes(key)) {
        event.preventDefault();
    }

    if (key === "m" || key === "escape") {
        sendInput({ btn_menu: true });
    } else if (key === "enter" || key === " ") {
        sendInput({ btn_ok: true });
    } else if (key === "arrowleft" || key === "a") {
        sendInput({ state: "left" });
    } else if (key === "arrowright" || key === "d") {
        sendInput({ state: "right" });
    } else if (key === "arrowup" || key === "w") {
        sendInput({ state: "up" });
    } else if (key === "arrowdown" || key === "s") {
        sendInput({ state: "down" });
    }
});

document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(key)) {
        sendInput({ state: "idle" });
    }
});

pauseMenu.addEventListener("click", async (event) => {
    const item = event.target.closest(".menu-item");
    if (!item) {
        return;
    }

    game.menuIndex = Number(item.dataset.gameMenuIndex);
    render();
    if (game.menuIndex === 0) {
        game.paused = false;
    } else {
        goDashboard();
    }
});

function goDashboard() {
    fetch("/api/dashboard-state/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screen: "dashboard", active_control: "led" }),
    }).finally(() => {
        window.location.href = "/";
    });
}

gamePadButtons.forEach((button) => {
    button.addEventListener("mousedown", () => {
        const input = button.dataset.gameInput;
        if (input === "menu") {
            sendInput({ btn_menu: true });
        } else if (input === "ok") {
            sendInput({ btn_ok: true });
        } else {
            sendInput({ state: input });
        }
    });

    button.addEventListener("mouseup", () => {
        const input = button.dataset.gameInput;
        if (["left", "right", "up", "down"].includes(input)) {
            sendInput({ state: "idle" });
        }
    });
});

resetGame();
requestAnimationFrame(loop);
