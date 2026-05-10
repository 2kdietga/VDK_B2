const state = {
    activeControl: "led",
    controlMode: "gesture",
    gesture: "dung_yen",
    led: 50,
    motor: 50,
    esp32Ip: "",
    esp32Port: "",
    esp32LastSeen: 0,
    esp32Online: false,
    lastServerUpdate: 0,
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
const espStatus = document.querySelector("#espStatus");
const espIp = document.querySelector("#espIp");
const espPort = document.querySelector("#espPort");
const espLastSeen = document.querySelector("#espLastSeen");
const modeButtons = Array.from(document.querySelectorAll(".mode-switch button"));
const controlCards = Array.from(document.querySelectorAll(".control"));

function clamp(value) {
    return Math.max(0, Math.min(100, value));
}

function render() {
    for (const control of ["led", "motor"]) {
        ranges[control].value = state[control];
        ranges[control].disabled = state.controlMode !== "manual";
        values[control].textContent = `${state[control]}%`;
        meters[control].style.width = `${state[control]}%`;
    }

    gestureLabel.textContent = labels[state.gesture] || state.gesture;
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
    if (state.controlMode !== "gesture") {
        return;
    }

    if (!state.esp32Online) {
        state.gesture = "dung_yen";
        render();
        return;
    }

    if (state.gesture !== "trai" && state.gesture !== "phai") {
        return;
    }

    const step = state.gesture === "phai" ? 2 : -2;
    const target = state.activeControl;
    state[target] = clamp(state[target] + step);
    render();
    pushDashboardState();
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

function syncFromServer(data) {
    state.gesture = data.gesture;
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

    if (state.controlMode === "gesture") {
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
        if (state.controlMode !== "manual") {
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

render();
setInterval(pollState, 250);
setInterval(applyContinuousGesture, 120);
setInterval(render, 1000);
