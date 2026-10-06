const MODULE = "dm-screen";
const SOCKET = `module.${MODULE}`;

let pendingFrame = null;

Hooks.once("init", () => {
  game.settings.register(MODULE, "screenUser", {
    name: "Игрок-ширма",
    hint: "Имя пользователя, под которым планшет заходит в мир. У него пропадает интерфейс.",
    scope: "world",
    config: true,
    type: String,
    default: "Ширма"
  });

  game.settings.register(MODULE, "blackout", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, onSocket);

  if (isScreenUser()) {
    document.body.classList.add("dm-screen");
    ensureBlackout();
    applyBlackout(game.settings.get(MODULE, "blackout"));
  }

  Hooks.on("updateSetting", (setting) => {
    if (setting.key !== `${MODULE}.blackout` || !isScreenUser()) return;
    applyBlackout(setting.value);
  });
});

Hooks.on("canvasReady", () => {
  if (!isScreenUser() || !pendingFrame) return;
  if (canvas.scene?.id !== pendingFrame.sceneId) return;
  const frame = pendingFrame;
  pendingFrame = null;
  panTo(frame);
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM || !controls.tokens?.tools) return;

  controls.tokens.tools.dmScreenShow = {
    name: "dmScreenShow",
    title: "Показать кадр на ширме",
    icon: "fa-solid fa-tv",
    button: true,
    visible: true,
    onChange: () => showFrame()
  };

  controls.tokens.tools.dmScreenBlackout = {
    name: "dmScreenBlackout",
    title: "Затемнить ширму",
    icon: "fa-solid fa-circle-half-stroke",
    toggle: true,
    visible: true,
    active: game.settings.get(MODULE, "blackout"),
    onChange: (_event, active) => setBlackout(active)
  };
});

function isScreenUser() {
  const expected = game.settings.get(MODULE, "screenUser") ?? "";
  return game.user.name.trim().toLowerCase() === expected.trim().toLowerCase();
}

function ensureBlackout() {
  if (document.getElementById("dm-screen-blackout")) return;
  const veil = document.createElement("div");
  veil.id = "dm-screen-blackout";
  document.body.appendChild(veil);
}

function applyBlackout(on) {
  document.body.classList.toggle("dm-screen-blackout", Boolean(on));
}

async function setBlackout(on) {
  await game.settings.set(MODULE, "blackout", on);
}

async function showFrame() {
  const scene = canvas.scene;
  if (!scene) return;
  if (!scene.active) await scene.activate();

  const frame = {
    action: "frame",
    sceneId: scene.id,
    x: canvas.stage.pivot.x,
    y: canvas.stage.pivot.y,
    scale: canvas.stage.scale.x
  };
  game.socket.emit(SOCKET, frame);
  ui.notifications.info("Кадр отправлен на ширму");
}

function onSocket(data) {
  if (!isScreenUser() || data?.action !== "frame") return;
  if (canvas.ready && canvas.scene?.id === data.sceneId) {
    pendingFrame = null;
    panTo(data);
    return;
  }
  pendingFrame = data;
}

function panTo(frame) {
  canvas.pan({ x: frame.x, y: frame.y, scale: frame.scale });
}
