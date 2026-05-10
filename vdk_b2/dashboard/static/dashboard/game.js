const gameState = {
    status: "playing",
    playerX: 18,
    enemyX: 76,
    enemyHp: 3,
    hp: 5,
    score: 0,
    facing: 1,
    attack: false,
    menuOpen: false,
    menuIndex: 0,
    lastServerUpdate: 0,
};

const player = document.querySelector("#player");
const enemy = document.querySelector("#enemy");
const slash = document.querySelector("#slash");
const lostOverlay = document.querySelector("#lostOverlay");
const pauseMenu = document.querySelector("#pauseMenu");
const menuItems = Array.from(document.querySelectorAll(".menu-item"));
const gamePadButtons = Array.from(document.querySelectorAll("[data-game-input]"));
const hpLabel = document.querySelector("#hpLabel");
const enemyLabel = document.querySelector("#enemyLabel");
const scoreLabel = document.querySelector("#scoreLabel");

function renderGame() {
    player.style.left = `${gameState.playerX}%`;
    enemy.style.left = `${gameState.enemyX}%`;
    player.classList.toggle("left", gameState.facing < 0);
    enemy.classList.toggle("hurt", gameState.enemyHp <= 1);

    slash.classList.toggle("hidden", !gameState.attack);
    slash.style.left = `${gameState.playerX + (gameState.facing > 0 ? 7 : -7)}%`;
    slash.classList.toggle("left", gameState.facing < 0);

    lostOverlay.classList.toggle("hidden", gameState.status !== "lost");
    pauseMenu.classList.toggle("hidden", !gameState.menuOpen);
    menuItems.forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.gameMenuIndex) === gameState.menuIndex);
    });

    hpLabel.textContent = `HP ${gameState.hp}`;
    enemyLabel.textContent = `Quái ${gameState.enemyHp}`;
    scoreLabel.textContent = `Điểm ${gameState.score}`;
}

function syncGame(data) {
    if (data.screen !== "game") {
        window.location.href = "/";
        return;
    }

    gameState.status = data.game_status || "playing";
    gameState.playerX = Number(data.game_player_x || 0);
    gameState.enemyX = Number(data.game_enemy_x || 0);
    gameState.enemyHp = Number(data.game_enemy_hp || 0);
    gameState.hp = Number(data.game_hp || 0);
    gameState.score = Number(data.game_score || 0);
    gameState.facing = Number(data.game_facing || 1);
    gameState.attack = Boolean(data.game_attack);
    gameState.menuOpen = Boolean(data.game_menu_open);
    gameState.menuIndex = Number(data.game_menu_index || 0);
}

async function sendInput(input) {
    const response = await fetch("/api/input/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    }).catch(() => null);

    if (!response) {
        return null;
    }

    return response.json().catch(() => null);
}

async function pollGame() {
    try {
        const response = await fetch("/api/state/", { cache: "no-store" });
        const data = await response.json();

        if (data.updated_at !== gameState.lastServerUpdate) {
            gameState.lastServerUpdate = data.updated_at;
            syncGame(data);
            renderGame();
        }
    } catch (error) {
        hpLabel.textContent = "Mất kết nối";
    }
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

    const targetIndex = Number(item.dataset.gameMenuIndex);
    if (targetIndex !== gameState.menuIndex) {
        await sendInput({ state: "down" });
    }

    gameState.menuIndex = targetIndex;
    renderGame();
    await sendInput({ btn_ok: true });
});

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

renderGame();
setInterval(pollGame, 160);
