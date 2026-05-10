const state = {
    activeControl: "led",
    controlMode: "gesture",
    gesture: "dung_yen",
    led: 50,
    motor: 50,
    btnMenu: false,
    btnOk: false,
    menuOpen: false,
    menuIndex: 0,
    screen: "dashboard",
    serverIp: "",
    serverPort: "",
    serverPath: "",
    esp32Ip: "",
    esp32Port: "",
    esp32LastSeen: 0,
    esp32Online: false,
    lastServerUpdate: 0,
    gestureDraftDirty: false,
    gestureCommitInFlight: false,
};

const labels = {
    len: "Lên",
    xuong: "Xuống",
    trai: "Trái",
    phai: "Phải",
    dung_yen: "Đứng yên",
};

const ranges = {
    led: document.querySelector("#ledRange"),
    motor: document.querySelector("#motorRange"),
};

const values = {
    led: document.querySelector("#ledValue"),
    motor: document.querySelector("#motorValue"),
};

const meters = {
    led: document.querySelector("#ledMeter"),
    motor: document.querySelector("#motorMeter"),
};

const gestureLabel = document.querySelector("#gestureLabel");
const serverStatus = document.querySelector("#serverStatus");
const serverIp = document.querySelector("#serverIp");
const serverPort = document.querySelector("#serverPort");
const serverPath = document.querySelector("#serverPath");
const espStatus = document.querySelector("#espStatus");
const espIp = document.querySelector("#espIp");
const espPort = document.querySelector("#espPort");
const espLastSeen = document.querySelector("#espLastSeen");
const modeButtons = Array.from(document.querySelectorAll(".mode-switch button"));
const controlCards = Array.from(document.querySelectorAll(".control"));
const menuPanel = document.querySelector("#menuPanel");
const menuItems = Array.from(document.querySelectorAll(".menu-item"));
const webPadButtons = Array.from(document.querySelectorAll("[data-web-input]"));

function clamp(value) {
    return Math.max(0, Math.min(100, value));
}

function render() {
    for (const control of ["led", "motor"]) {
        ranges[control].value = state[control];
        ranges[control].disabled = state.controlMode !== "manual" || state.menuOpen;
        values[control].textContent = `${state[control]}%`;
        meters[control].style.width = `${state[control]}%`;
    }

    gestureLabel.textContent = labels[state.gesture] || state.gesture;
    serverStatus.textContent = "CoAP sẵn sàng";
    serverStatus.classList.add("online");
    serverIp.textContent = state.serverIp || "--";
    serverPort.textContent = state.serverPort || "--";
    serverPath.textContent = state.serverPath || "--";
    espStatus.textContent = state.esp32Online ? "Đang kết nối" : "Mất kết nối";
    espStatus.classList.toggle("online", state.esp32Online);
    espIp.textContent = state.esp32Ip || "--";
    espPort.textContent = state.esp32Port || "--";
    espLastSeen.textContent = formatLastSeen(state.esp32LastSeen);

    modeButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.mode === state.controlMode);
    });

    controlCards.forEach((card) => {
        card.classList.toggle("active", card.dataset.control === state.activeControl);
        card.classList.toggle("manual", state.controlMode === "manual");
    });

    menuPanel.classList.toggle("hidden", !state.menuOpen);
    menuItems.forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.menuIndex) === state.menuIndex);
    });

}

function formatLastSeen(timestamp) {
    if (!timestamp) {
        return "--";
    }

    const seconds = Math.max(0, Math.round(Date.now() / 1000 - timestamp));
    if (seconds < 2) {
        return "vừa xong";
    }

    return `${seconds}s trước`;
}

function moveSelection(direction) {
    if (direction === "len") {
        state.activeControl = "led";
    }

    if (direction === "xuong") {
        state.activeControl = "motor";
    }
}

function applyContinuousGesture() {
    if (state.controlMode !== "gesture" || state.menuOpen) {
        return;
    }

    if (!state.esp32Online) {
        state.gesture = "dung_yen";
        render();
        return;
    }

    if (state.gesture === "dung_yen") {
        commitGestureDraft();
        return;
    }

    if (state.gesture !== "trai" && state.gesture !== "phai") {
        return;
    }

    const step = state.gesture === "phai" ? 2 : -2;
    const target = state.activeControl;
    const previousValue = state[target];
    state[target] = clamp(previousValue + step);

    if (state[target] !== previousValue) {
        state.gestureDraftDirty = true;
    }

    render();

    if (state[target] === 0 || state[target] === 100) {
        commitGestureDraft();
    }
}

async function pushDashboardState() {
    await fetch("/api/dashboard-state/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            active_control: state.activeControl,
            control_mode: state.controlMode,
            led: state.led,
            motor: state.motor,
        }),
    }).catch(() => {});
}

async function commitGestureDraft() {
    if (!state.gestureDraftDirty || state.gestureCommitInFlight) {
        return;
    }

    state.gestureCommitInFlight = true;
    await pushDashboardState();
    state.gestureDraftDirty = false;
    state.gestureCommitInFlight = false;
}

async function sendInput(input) {
    const response = await fetch("/api/input/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    }).catch(() => {});

    if (!response) {
        return null;
    }

    return response.json().catch(() => null);
}

function syncFromServer(data) {
    const previousGesture = state.gesture;
    const incomingGesture = data.gesture;
    const shouldCommitGestureDraft =
        state.controlMode === "gesture"
        && !state.menuOpen
        && incomingGesture === "dung_yen"
        && (previousGesture === "trai" || previousGesture === "phai")
        && state.gestureDraftDirty;

    state.gesture = incomingGesture;
    state.btnMenu = Boolean(data.btn_menu);
    state.btnOk = Boolean(data.btn_ok);
    state.menuOpen = Boolean(data.menu_open);
    state.menuIndex = Number(data.menu_index || 0);
    state.screen = data.screen || "dashboard";
    if (state.screen === "game") {
        window.location.href = "/game/";
        return;
    }
    state.serverIp = data.server_ip || "";
    state.serverPort = data.server_coap_port || "";
    state.serverPath = data.server_coap_path || "";
    state.esp32Ip = data.esp32_ip || "";
    state.esp32Port = data.esp32_port || "";
    state.esp32LastSeen = Number(data.esp32_last_seen || 0);
    state.esp32Online = Boolean(data.esp32_online);
    if (!state.esp32Online) {
        state.gesture = "dung_yen";
    }

    if (data.control_mode === "gesture" || data.control_mode === "manual") {
        state.controlMode = data.control_mode;
    }

    if (state.controlMode === "gesture" && !state.menuOpen) {
        if (!state.esp32Online) {
            state.gesture = "dung_yen";
            state.led = Number(data.led);
            state.motor = Number(data.motor);
            state.activeControl = data.active_control;
            return;
        }

        if (data.gesture === "len" || data.gesture === "xuong") {
            moveSelection(data.gesture);
            pushDashboardState();
        }

        if (data.gesture === "dung_yen") {
            if (shouldCommitGestureDraft) {
                commitGestureDraft();
                return;
            }

            state.led = Number(data.led);
            state.motor = Number(data.motor);
            state.activeControl = data.active_control;
        }
    } else {
        state.led = Number(data.led);
        state.motor = Number(data.motor);
        state.activeControl = data.active_control;
    }
}

async function pollState() {
    try {
        const response = await fetch("/api/state/", { cache: "no-store" });
        const data = await response.json();

        if (data.updated_at !== state.lastServerUpdate || data.esp32_online !== state.esp32Online) {
            state.lastServerUpdate = data.updated_at;
            syncFromServer(data);
            render();
        }
    } catch (error) {
        gestureLabel.textContent = "Mất kết nối";
        espStatus.textContent = "Mất kết nối";
        espStatus.classList.remove("online");
    }
}

for (const control of ["led", "motor"]) {
    ranges[control].addEventListener("input", (event) => {
        if (state.controlMode !== "manual" || state.menuOpen) {
            return;
        }

        state[control] = Number(event.target.value);
        state.activeControl = control;
        render();
        pushDashboardState();
    });
}

modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        state.controlMode = button.dataset.mode;
        render();
        pushDashboardState();
    });
});

menuItems.forEach((item) => {
    item.addEventListener("click", async () => {
        const targetIndex = Number(item.dataset.menuIndex);
        while (state.menuIndex !== targetIndex) {
            const nextState = await sendInput({ state: "down" });
            if (!nextState) {
                break;
            }
            syncFromServer(nextState);
        }

        await sendInput({ btn_ok: true });
    });
});

webPadButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const input = button.dataset.webInput;
        if (input === "menu") {
            sendInput({ btn_menu: true });
        } else if (input === "ok") {
            sendInput({ btn_ok: true });
        } else {
            sendInput({ state: input });
        }
    });
});

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "enter", " ", "m"].includes(key)) {
        event.preventDefault();
    }

    if (key === "m") {
        sendInput({ btn_menu: true });
        return;
    }

    if (key === "enter" || key === " ") {
        sendInput({ btn_ok: true });
        return;
    }

    if (key === "arrowup") {
        sendInput({ state: "up" });
    } else if (key === "arrowdown") {
        sendInput({ state: "down" });
    } else if (key === "arrowleft") {
        if (state.controlMode === "manual" && !state.menuOpen) {
            state[state.activeControl] = clamp(state[state.activeControl] - 2);
            render();
            pushDashboardState();
        } else {
            sendInput({ state: "left" });
        }
    } else if (key === "arrowright") {
        if (state.controlMode === "manual" && !state.menuOpen) {
            state[state.activeControl] = clamp(state[state.activeControl] + 2);
            render();
            pushDashboardState();
        } else {
            sendInput({ state: "right" });
        }
    }
});

render();
setInterval(pollState, 250);
setInterval(applyContinuousGesture, 120);
setInterval(render, 1000);
