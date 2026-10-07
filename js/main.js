(function () {
  const store = window.ShirmoStore;
  const live = window.ShirmoLive;
  const params = new URLSearchParams(location.search);
  const isPlay = params.get("view") === "play";

  const gate = document.getElementById("gate");
  const editorSection = document.getElementById("editor");
  const stageView = document.getElementById("stage-view");
  const frame = document.getElementById("frame");

  let project = null;
  let viewCodex = false;
  let paintReady = false;
  let paintTool = "brush";
  let paintColor = "#f3ead8";
  let paintFillColor = "#c45a4a";
  let paintSize = 8;
  let paintFill = false;
  let paintBold = false;
  let paintItalic = false;
  let paintUnderline = false;
  let paintStrike = false;
  let paintFrame = false;
  let paintOutline = false;
  let paintDrawing = false;
  let paintUndo = [];
  let paintClip = null;
  let paintPasteAt = 0;
  let paintToken = 0;
  let paintLayers = [];
  let paintActive = "";
  let paintStamp = null;
  let paintStart = null;
  let paintPending = null;
  let paintDrag = null;
  let saveTimer = 0;
  let saveChain = Promise.resolve();
  let navLock = false;

  function show(section) {
    gate.classList.toggle("hidden", section !== gate);
    editorSection.classList.toggle("hidden", section !== editorSection);
    stageView.classList.toggle("hidden", section !== stageView);
  }

  function activePage() {
    return project.pages.find(function (page) { return page.id === project.activePageId; }) || project.pages[0];
  }

  function clampStage(value, fallback, min, max) {
    const number = Number(value);
    if (!number) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function pageDocument(page) {
    const stage = project.stage;
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>" +
      "html,body{margin:0;width:" + stage.width + "px;height:" + stage.height + "px;overflow:hidden;background:#16130f;}" +
      (page.css || "") +
      "</style></head><body>" + (page.html || "") + "</body></html>";
  }

  function fitFrame() {
    const stage = project.stage;
    const scale = Math.min(window.innerWidth / stage.width, window.innerHeight / stage.height);
    const fit = document.getElementById("stage-fit");
    fit.style.width = stage.width + "px";
    fit.style.height = stage.height + "px";
    fit.style.transform = "scale(" + scale + ")";
  }

  function playerPage() {
    const id = project.shownPageId || project.activePageId;
    return project.pages.find(function (page) { return page.id === id; }) || project.pages[0];
  }

  function renderPlay() {
    const page = playerPage();
    const kind = page.kind || "free";
    const scenePlay = document.getElementById("scene-play");
    frame.classList.toggle("hidden", kind !== "free");
    scenePlay.classList.toggle("hidden", kind === "free");
    if (kind === "free") {
      if (page.paint) {
        frame.classList.add("hidden");
        scenePlay.classList.remove("hidden");
        scenePlay.innerHTML = "";
        const img = document.createElement("img");
        img.className = "paint-view";
        img.alt = "";
        img.src = page.paint;
        scenePlay.appendChild(img);
      } else {
        frame.classList.remove("hidden");
        scenePlay.classList.add("hidden");
        frame.srcdoc = pageDocument(page);
      }
    } else {
      window.ShirmoScenes.setContext({
        catalog: function () { return project.codex; },
        page: function () { return page; }
      });
      window.ShirmoScenes.renderPlay(scenePlay, page, function (mutate) {
        mutate(page);
        renderPlay();
        store.getProject().then(function (fresh) {
          if (!fresh) return;
          const current = fresh.pages.find(function (item) { return item.id === page.id; });
          if (!current) return;
          mutate(current);
          fresh.rev = (fresh.rev || 0) + 1;
          return store.saveProject(fresh);
        }).then(function () {
          live.touch();
        });
      });
    }
    window.ShirmoDice.sync(document.getElementById("die"), project.die, project.stage);
    syncHit(document.getElementById("float"), project.hit);
    syncFx(page);
    fitFrame();
  }

  const fxNames = { rain: "Дождь", storm: "Шторм", fire: "Огонь", smoke: "Дым", fog: "Туман", snow: "Снег" };
  const fxLive = { smoke: true, fog: true, snow: true, fire: true };

  function syncFx(page) {
    const name = page && fxNames[page.fx] ? page.fx : "";
    const particles = Boolean(fxLive[name]);
    const video = document.getElementById("fx");
    if (video) {
      if (!name || particles) {
        video.classList.add("hidden");
        if (video.getAttribute("src")) {
          video.removeAttribute("src");
          video.load();
        }
        video.dataset.fx = "";
      } else if (video.dataset.fx === name) {
        video.classList.remove("hidden");
        if (video.paused) video.play().catch(function () {});
      } else {
        video.dataset.fx = name;
        video.muted = true;
        video.loop = true;
        video.classList.remove("hidden");
        video.src = "fx/" + name + ".webm";
        video.play().catch(function () {});
      }
    }
    if (window.ShirmoFx) {
      window.ShirmoFx.sync(document.getElementById("fx-live"), particles ? {
        name: name,
        rate: page.fxRate,
        size: page.fxSize
      } : null);
    }
  }

  function syncFxButton() {
    const page = activePage();
    const name = page && fxNames[page.fx] ? page.fx : "";
    const open = document.getElementById("fx-open");
    if (!open) return;
    open.classList.toggle("is-on", Boolean(name));
    open.textContent = name ? "Эффекты: " + fxNames[name] : "Эффекты";
    document.querySelectorAll("#fx-menu [data-fx]").forEach(function (button) {
      button.classList.toggle("is-on", (button.getAttribute("data-fx") || "") === name);
    });
    const rate = document.getElementById("fx-rate");
    const size = document.getElementById("fx-size");
    if (rate && document.activeElement !== rate) rate.value = page && page.fxRate != null ? page.fxRate : 78;
    if (size && document.activeElement !== size) size.value = page && page.fxSize != null ? page.fxSize : 76;
  }

  function appendLog(line) {
    const page = activePage();
    const scene = page && page.scene;
    if (!page || page.kind !== "initiative" || !scene || !scene.logRolls) return;
    scene.log = scene.log && String(scene.log).trim() ? String(scene.log).replace(/\s*$/, "") + "\n" + line : line;
    const area = document.querySelector("#scene-editor [data-log]");
    if (area) area.value = scene.log;
  }

  function textEsc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function syncHit(node, hit) {
    if (!node || !hit || !hit.id) return;
    if (node.dataset.played === String(hit.id)) return;
    if (Date.now() - (Number(hit.at) || 0) > 6000) {
      node.dataset.played = String(hit.id);
      return;
    }
    node.dataset.played = String(hit.id);
    node.innerHTML = '<div class="dmg-pop"><b>' + textEsc(hit.total) + "</b>" +
      (hit.label ? "<small>" + textEsc(hit.label) + "</small>" : "") + "</div>";
    setTimeout(function () {
      if (node.dataset.played === String(hit.id)) node.innerHTML = "";
    }, 2100);
  }

  function dieMs() {
    const page = activePage();
    const scene = page && page.scene;
    return scene && scene.dieMs ? scene.dieMs : 2300;
  }

  function publishDie(result, label) {
    captureEditor();
    const ms = dieMs();
    if (result && typeof result === "object" && Array.isArray(result.dice)) {
      const total = result.total;
      const mode = result.mode || "";
      const text = result.log || String(total);
      appendLog((label ? label + ": " : "Бросок: ") + text);
      project.die = {
        id: store.uid(),
        result: total,
        dice: result.dice,
        bonus: result.bonus || 0,
        total: total,
        mode: mode,
        label: label || result.label || "",
        at: Date.now(),
        ms: ms
      };
      const button = document.getElementById("roll-d20");
      if (button) button.title = "Выпало " + text;
      persist();
      return;
    }
    appendLog((label ? label + ": " : "Бросок: ") + result);
    project.die = {
      id: store.uid(),
      result: result,
      label: label || "",
      at: Date.now(),
      ms: ms
    };
    const button = document.getElementById("roll-d20");
    if (button) button.title = "Выпало " + result;
    persist();
  }

  function openDiePop() {
    const pop = document.getElementById("pop");
    if (!pop) return;
    const sides = [4, 6, 8, 10, 12, 20, 100];
    pop.classList.remove("hidden");
    pop.innerHTML = '<div class="pop-card die-card" role="dialog" aria-label="Бросок кубиков">' +
      '<div class="pop-head"><h2>Бросок</h2><button type="button" data-pop-close>×</button></div>' +
      '<div class="die-pop-row"><label>Количество <input id="die-count" type="number" min="1" max="12" value="1"></label>' +
      '<div class="die-sides" id="die-sides">' + sides.map(function (n, i) {
        return '<button type="button" data-sides="' + n + '"' + (n === 20 ? ' class="is-on"' : "") + ">d" + n + "</button>";
      }).join("") + "</div></div>" +
      '<div class="die-pop-row die-flags">' +
      '<label class="check"><input id="die-adv" type="checkbox"> С преимуществом</label>' +
      '<label class="check"><input id="die-dis" type="checkbox"> С помехой</label></div>' +
      '<p class="scene-note" id="die-hint">2d20: обычный и зелёный. Берётся больший.</p>' +
      '<div class="row"><button type="button" class="primary" id="die-throw">Бросить</button></div></div>';
    const hint = pop.querySelector("#die-hint");
    const count = pop.querySelector("#die-count");
    const adv = pop.querySelector("#die-adv");
    const dis = pop.querySelector("#die-dis");
    let picked = 20;
    function syncHint() {
      const special = adv.checked || dis.checked;
      count.disabled = special;
      pop.querySelectorAll("[data-sides]").forEach(function (button) {
        button.disabled = special;
      });
      if (adv.checked) hint.textContent = "2d20: обычный и зелёный. Берётся больший.";
      else if (dis.checked) hint.textContent = "2d20: обычный и красный. Берётся меньший.";
      else hint.textContent = Math.min(12, Math.max(1, Number(count.value) || 1)) + "d" + picked;
    }
    syncHint();
    function close() { pop.classList.add("hidden"); }
    pop.querySelector("[data-pop-close]").addEventListener("click", close);
    if (pop._dieAway) pop.removeEventListener("click", pop._dieAway);
    pop._dieAway = function (event) { if (event.target === pop) close(); };
    pop.addEventListener("click", pop._dieAway);
    pop.querySelector("#die-sides").addEventListener("click", function (event) {
      const button = event.target.closest("[data-sides]");
      if (!button || button.disabled) return;
      picked = Number(button.getAttribute("data-sides"));
      pop.querySelectorAll("[data-sides]").forEach(function (node) {
        node.classList.toggle("is-on", node === button);
      });
      syncHint();
    });
    adv.addEventListener("change", function () {
      if (adv.checked) dis.checked = false;
      syncHint();
    });
    dis.addEventListener("change", function () {
      if (dis.checked) adv.checked = false;
      syncHint();
    });
    count.addEventListener("input", syncHint);
    pop.querySelector("#die-throw").addEventListener("click", function () {
      let roll;
      if (adv.checked || dis.checked) {
        const a = 1 + Math.floor(Math.random() * 20);
        const b = 1 + Math.floor(Math.random() * 20);
        const mode = adv.checked ? "advantage" : "disadvantage";
        const total = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
        roll = {
          dice: [
            { sides: 20, value: a, sign: 1 },
            { sides: 20, value: b, sign: 1, tint: mode }
          ],
          total: total,
          bonus: 0,
          mode: mode,
          label: mode === "advantage" ? "Преимущество" : "Помеха",
          log: a + " · " + b + " → " + total
        };
      } else {
        const n = Math.min(12, Math.max(1, Number(count.value) || 1));
        const dice = [];
        let total = 0;
        for (let i = 0; i < n; i++) {
          const value = 1 + Math.floor(Math.random() * picked);
          dice.push({ sides: picked, value: value, sign: 1 });
          total += value;
        }
        roll = {
          dice: dice,
          total: total,
          bonus: 0,
          label: n + "d" + picked,
          log: n === 1 ? String(total) : dice.map(function (item) { return item.value; }).join("+") + "=" + total
        };
      }
      close();
      publishDie(roll, roll.label || "");
    });
  }

  function publishHit(roll, label) {
    captureEditor();
    const total = roll && typeof roll === "object" ? roll.total : roll;
    appendLog((label ? label + ": " : "Урон: ") + total);
    const page = activePage();
    const scene = page && page.scene;
    const ms = scene && scene.dieMs ? scene.dieMs : 2300;
    project.die = {
      id: store.uid(),
      result: total,
      dice: roll && roll.dice ? roll.dice : [],
      bonus: roll && roll.bonus ? roll.bonus : 0,
      total: total,
      label: label || "",
      at: Date.now(),
      ms: ms
    };
    persist();
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function codexOpen() {
    return viewCodex;
  }

  function paintCanvas() {
    return document.getElementById("paint-canvas");
  }

  function paintPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    };
  }

  function paintShape(tool) {
    return tool === "line" || tool === "rect" || tool === "ellipse";
  }

  function isObjectLayer(layer) {
    if (!layer) return false;
    if (layer.kind === "shape") return true;
    if (layer.kind === "text") return true;
    return layer.kind === "image" && !!layer.img;
  }

  function textFontSize(layer) {
    return Math.max(8, Number(layer && layer.size) || 32);
  }

  function textFont(layer) {
    const style = layer && layer.italic ? "italic" : "normal";
    const weight = layer && layer.bold ? "bold" : "normal";
    return style + " " + weight + " " + textFontSize(layer) + "px Arial";
  }

  function textLines(layer) {
    return String(layer && layer.text != null ? layer.text : "").split("\n");
  }

  function measureTextBox(layer) {
    const size = textFontSize(layer);
    const pad = layer && layer.frame ? Math.max(6, size * 0.22) : Math.max(2, size * 0.08);
    const lineH = size * 1.25;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = textFont(layer);
    const lines = textLines(layer);
    let maxW = 0;
    for (let i = 0; i < lines.length; i++) {
      maxW = Math.max(maxW, probe.measureText(lines[i] || " ").width);
    }
    return {
      w: Math.max(8, Math.ceil(maxW + pad * 2)),
      h: Math.max(8, Math.ceil(Math.max(1, lines.length) * lineH + pad * 2)),
      pad: pad,
      lineH: lineH,
      lines: lines
    };
  }

  function fitTextBox(layer) {
    if (!layer || layer.kind !== "text") return;
    const box = measureTextBox(layer);
    layer.w = box.w;
    layer.h = box.h;
  }

  function drawTextLayer(ctx, layer) {
    if (!layer || !String(layer.text || "").length) return;
    const size = textFontSize(layer);
    const color = layer.color || paintColor;
    const box = measureTextBox(layer);
    const pad = box.pad;
    ctx.save();
    ctx.font = textFont(layer);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.globalCompositeOperation = "source-over";
    if (layer.frame) {
      ctx.lineWidth = Math.max(1, size / 16);
      ctx.strokeStyle = color;
      ctx.strokeRect(layer.x + 0.5, layer.y + 0.5, Math.max(1, layer.w - 1), Math.max(1, layer.h - 1));
    }
    let ty = layer.y + pad;
    for (let i = 0; i < box.lines.length; i++) {
      const line = box.lines[i];
      const tx = layer.x + pad;
      if (layer.outline) {
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.lineWidth = Math.max(2, size / 10);
        ctx.strokeStyle = "#0d0b09";
        ctx.strokeText(line, tx, ty);
      }
      ctx.fillStyle = color;
      ctx.fillText(line, tx, ty);
      const width = ctx.measureText(line || " ").width;
      if (layer.underline || layer.strike) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, size / 18);
        if (layer.underline) {
          const uy = ty + size * 0.92;
          ctx.beginPath();
          ctx.moveTo(tx, uy);
          ctx.lineTo(tx + width, uy);
          ctx.stroke();
        }
        if (layer.strike) {
          const sy = ty + size * 0.48;
          ctx.beginPath();
          ctx.moveTo(tx, sy);
          ctx.lineTo(tx + width, sy);
          ctx.stroke();
        }
      }
      ty += box.lineH;
    }
    ctx.restore();
  }

  function textDefaults() {
    return {
      bold: paintBold,
      italic: paintItalic,
      underline: paintUnderline,
      strike: paintStrike,
      frame: paintFrame,
      outline: paintOutline,
      color: paintColor,
      size: Math.max(24, Math.round(paintSize * 3))
    };
  }

  function layerById(id) {
    for (let i = 0; i < paintLayers.length; i++) {
      if (paintLayers[i].id === id) return paintLayers[i];
    }
    return null;
  }

  function activeLayer() {
    return layerById(paintActive) || paintLayers[paintLayers.length - 1] || null;
  }

  function makeLayer(name) {
    const canvas = document.createElement("canvas");
    canvas.width = project.stage.width;
    canvas.height = project.stage.height;
    return {
      id: store.uid(),
      name: name,
      kind: "paint",
      visible: true,
      ink: false,
      ready: true,
      touched: false,
      src: "",
      canvas: canvas
    };
  }

  function blankImageLayer(name) {
    return {
      id: store.uid(),
      name: name,
      kind: "image",
      visible: true,
      ink: false,
      ready: true,
      touched: false,
      src: "",
      img: null,
      x: 0,
      y: 0,
      w: 0,
      h: 0
    };
  }

  function markTools() {
    document.querySelectorAll("[data-paint-tool]").forEach(function (chip) {
      chip.classList.toggle("is-on", chip.getAttribute("data-paint-tool") === paintTool);
    });
    const imageButton = document.getElementById("paint-image");
    if (imageButton) imageButton.classList.toggle("is-on", paintTool === "image");
  }

  function renderLayerList() {
    const list = document.getElementById("paint-layer-list");
    if (!list) return;
    list.innerHTML = "";
    for (let i = paintLayers.length - 1; i >= 0; i--) {
      const layer = paintLayers[i];
      const row = document.createElement("div");
      row.className = "layer-row" + (layer.id === paintActive ? " is-on" : "");
      row.setAttribute("data-layer", layer.id);
      const eye = document.createElement("button");
      eye.type = "button";
      eye.className = "layer-eye" + (layer.visible ? "" : " is-off");
      eye.setAttribute("data-layer-eye", "");
      eye.title = layer.visible ? "Скрыть" : "Показать";
      eye.textContent = layer.visible ? "◉" : "○";
      const input = document.createElement("input");
      input.setAttribute("data-layer-name", "");
      input.value = layer.name;
      input.setAttribute("aria-label", "Имя слоя");
      row.appendChild(eye);
      row.appendChild(input);
      list.appendChild(row);
    }
  }

  function markActiveLayer() {
    document.querySelectorAll("#paint-layer-list .layer-row").forEach(function (row) {
      row.classList.toggle("is-on", row.getAttribute("data-layer") === paintActive);
    });
  }

  function handleSize() {
    const canvas = paintCanvas();
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width || 1;
    return 14 / scale;
  }

  function handlePoints(layer) {
    const x = layer.x;
    const y = layer.y;
    const right = layer.x + layer.w;
    const bottom = layer.y + layer.h;
    const cx = layer.x + layer.w / 2;
    const cy = layer.y + layer.h / 2;
    return {
      nw: { x: x, y: y },
      n: { x: cx, y: y },
      ne: { x: right, y: y },
      e: { x: right, y: cy },
      se: { x: right, y: bottom },
      s: { x: cx, y: bottom },
      sw: { x: x, y: bottom },
      w: { x: x, y: cy }
    };
  }

  function hitHandle(point, layer) {
    if (!layer || !layer.visible) return "";
    const half = handleSize() / 2 + 2;
    if (layer.kind === "shape" && layer.shape === "line") {
      if (Math.hypot(point.x - layer.x1, point.y - layer.y1) <= half) return "a";
      if (Math.hypot(point.x - layer.x2, point.y - layer.y2) <= half) return "b";
      return "";
    }
    if (layer.kind !== "image" && layer.kind !== "shape" && layer.kind !== "text") return "";
    if (layer.kind === "image" && !layer.img) return "";
    if (layer.w < 1 || layer.h < 1) return "";
    const points = handlePoints(layer);
    const names = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (let i = 0; i < names.length; i++) {
      const spot = points[names[i]];
      if (Math.abs(point.x - spot.x) <= half && Math.abs(point.y - spot.y) <= half) return names[i];
    }
    return "";
  }

  function hitBody(point, layer) {
    return point.x >= layer.x && point.y >= layer.y && point.x <= layer.x + layer.w && point.y <= layer.y + layer.h;
  }

  function lineDistance(point, layer) {
    const dx = layer.x2 - layer.x1;
    const dy = layer.y2 - layer.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((point.x - layer.x1) * dx + (point.y - layer.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(point.x - (layer.x1 + t * dx), point.y - (layer.y1 + t * dy));
  }

  function hitShape(point, layer) {
    const tol = Math.max(12, (layer.size || 8) / 2 + 6);
    if (layer.shape === "line") return lineDistance(point, layer) <= tol;
    return point.x >= layer.x - tol && point.x <= layer.x + layer.w + tol && point.y >= layer.y - tol && point.y <= layer.y + layer.h + tol;
  }

  function objectAt(point) {
    for (let i = paintLayers.length - 1; i >= 0; i--) {
      const layer = paintLayers[i];
      if (!layer.visible) continue;
      if (layer.kind === "image" && layer.img && hitBody(point, layer)) return layer;
      if (layer.kind === "shape" && hitShape(point, layer)) return layer;
      if (layer.kind === "text" && String(layer.text || "") && hitBody(point, layer)) return layer;
    }
    return null;
  }

  function paintTarget() {
    const active = activeLayer();
    if (active && active.kind === "paint") return active.visible ? active : null;
    const index = paintLayers.findIndex(function (item) { return item.id === paintActive; });
    for (let i = index - 1; i >= 0; i--) {
      if (paintLayers[i].kind === "paint" && paintLayers[i].visible) return paintLayers[i];
    }
    for (let i = 0; i < paintLayers.length; i++) {
      if (paintLayers[i].kind === "paint" && paintLayers[i].visible) return paintLayers[i];
    }
    return null;
  }

  function drawSelection(ctx) {
    const layer = activeLayer();
    const selectable = layer && layer.visible && isObjectLayer(layer);
    if (paintTool !== "select" || !selectable) return;
    const size = handleSize();
    ctx.save();
    ctx.strokeStyle = "#e6c36a";
    ctx.fillStyle = "#e6c36a";
    ctx.lineWidth = Math.max(1, size / 7);
    if (layer.kind === "shape" && layer.shape === "line") {
      ctx.beginPath();
      ctx.moveTo(layer.x1, layer.y1);
      ctx.lineTo(layer.x2, layer.y2);
      ctx.stroke();
      [ [layer.x1, layer.y1], [layer.x2, layer.y2] ].forEach(function (spot) {
        ctx.fillRect(spot[0] - size / 2, spot[1] - size / 2, size, size);
      });
      ctx.restore();
      return;
    }
    ctx.strokeRect(layer.x, layer.y, layer.w, layer.h);
    const points = handlePoints(layer);
    Object.keys(points).forEach(function (name) {
      const spot = points[name];
      ctx.fillRect(spot.x - size / 2, spot.y - size / 2, size, size);
    });
    ctx.restore();
  }

  function composite(chrome) {
    const canvas = paintCanvas();
    if (!canvas || !canvas.width) return;
    const ctx = canvas.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#16130f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paintLayers.forEach(function (layer) {
      if (!layer.visible) return;
      if (layer.kind === "image") {
        if (layer.img && layer.w > 0 && layer.h > 0) ctx.drawImage(layer.img, layer.x, layer.y, layer.w, layer.h);
        return;
      }
      if (layer.kind === "shape") {
        drawVector(ctx, layer);
        return;
      }
      if (layer.kind === "text") {
        drawTextLayer(ctx, layer);
        return;
      }
      if (layer.canvas) ctx.drawImage(layer.canvas, 0, 0);
    });
    if (chrome) drawSelection(ctx);
  }

  function present() {
    composite(true);
  }

  function applyResize(layer, handle, point, shift) {
    if (handle === "a" || handle === "b") {
      const fixedX = handle === "a" ? paintDrag.box.x2 : paintDrag.box.x1;
      const fixedY = handle === "a" ? paintDrag.box.y2 : paintDrag.box.y1;
      let x = point.x;
      let y = point.y;
      if (shift) {
        const angle = Math.atan2(y - fixedY, x - fixedX);
        const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(x - fixedX, y - fixedY);
        x = fixedX + Math.cos(snap) * len;
        y = fixedY + Math.sin(snap) * len;
      }
      if (handle === "a") { layer.x1 = x; layer.y1 = y; }
      else { layer.x2 = x; layer.y2 = y; }
      return;
    }
    const box = paintDrag.box;
    let left = box.x;
    let top = box.y;
    let right = box.x + box.w;
    let bottom = box.y + box.h;
    if (handle.indexOf("w") >= 0) left = point.x;
    if (handle.indexOf("e") >= 0) right = point.x;
    if (handle.indexOf("n") >= 0) top = point.y;
    if (handle.indexOf("s") >= 0) bottom = point.y;
    let w = right - left;
    let h = bottom - top;
    if (shift && box.w && box.h) {
      const aspect = box.w / box.h;
      if (handle === "n" || handle === "s") w = Math.abs(h) * aspect * Math.sign(w || 1);
      else if (handle === "e" || handle === "w") h = Math.abs(w) / aspect * Math.sign(h || 1);
      else if (Math.abs(w) / box.w >= Math.abs(h) / box.h) h = Math.abs(w) / aspect * Math.sign(h || 1);
      else w = Math.abs(h) * aspect * Math.sign(w || 1);
      if (handle.indexOf("w") >= 0) left = right - w;
      else if (handle.indexOf("e") >= 0) right = left + w;
      else left = box.x + (box.w - w) / 2;
      if (handle.indexOf("n") >= 0) top = bottom - h;
      else if (handle.indexOf("s") >= 0) bottom = top + h;
      else top = box.y + (box.h - h) / 2;
      w = right - left;
      h = bottom - top;
    }
    if (w < 0) { left += w; w = -w; }
    if (h < 0) { top += h; h = -h; }
    layer.x = left;
    layer.y = top;
    layer.w = Math.max(8, w);
    layer.h = Math.max(8, h);
  }

  function layerHasInk(layer) {
    if (layer.kind === "shape") {
      if (layer.shape === "line") return Math.hypot(layer.x2 - layer.x1, layer.y2 - layer.y1) > 1;
      return layer.w > 1 && layer.h > 1;
    }
    if (layer.kind === "text") return !!(String(layer.text || "").trim() && layer.w > 0 && layer.h > 0);
    if (layer.kind === "image") return !!(layer.img && layer.w > 0 && layer.h > 0);
    if (!layer.canvas) return false;
    const data = layer.canvas.getContext("2d").getImageData(0, 0, layer.canvas.width, layer.canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]) return true;
    }
    return false;
  }

  function rememberLayer(layer) {
    if (!layer) return;
    if (layer.kind === "image") {
      paintUndo.push({
        id: layer.id,
        box: { x: layer.x, y: layer.y, w: layer.w, h: layer.h },
        src: layer.src,
        img: layer.img
      });
    } else if (layer.kind === "shape") {
      paintUndo.push({
        id: layer.id,
        geom: {
          x: layer.x, y: layer.y, w: layer.w, h: layer.h,
          x1: layer.x1, y1: layer.y1, x2: layer.x2, y2: layer.y2,
          color: layer.color, fillColor: layer.fillColor, size: layer.size
        }
      });
    } else if (layer.kind === "text") {
      paintUndo.push({
        id: layer.id,
        text: {
          x: layer.x, y: layer.y, w: layer.w, h: layer.h,
          text: layer.text, color: layer.color, size: layer.size,
          bold: !!layer.bold, italic: !!layer.italic,
          underline: !!layer.underline, strike: !!layer.strike,
          frame: !!layer.frame, outline: !!layer.outline
        }
      });
    } else if (layer.canvas) {
      paintUndo.push({
        id: layer.id,
        data: layer.canvas.getContext("2d").getImageData(0, 0, layer.canvas.width, layer.canvas.height)
      });
    }
    if (paintUndo.length > 12) paintUndo.shift();
  }

  function styleLayer(ctx, erase) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = paintSize;
    ctx.strokeStyle = paintColor;
    ctx.fillStyle = paintColor;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  }

  function shapeBox(a, b, shift) {
    let x1 = b.x;
    let y1 = b.y;
    if (shift) {
      const side = Math.max(Math.abs(x1 - a.x), Math.abs(y1 - a.y));
      x1 = a.x + side * Math.sign(x1 - a.x || 1);
      y1 = a.y + side * Math.sign(y1 - a.y || 1);
    }
    const x = Math.min(a.x, x1);
    const y = Math.min(a.y, y1);
    return { x: x, y: y, w: Math.abs(x1 - a.x), h: Math.abs(y1 - a.y), x1: x1, y1: y1 };
  }

  function traceShape(ctx, tool, a, b, shift, erase) {
    styleLayer(ctx, erase);
    let x1 = b.x;
    let y1 = b.y;
    if (shift && tool === "line") {
      const angle = Math.atan2(y1 - a.y, x1 - a.x);
      const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x1 - a.x, y1 - a.y);
      x1 = a.x + Math.cos(snap) * len;
      y1 = a.y + Math.sin(snap) * len;
    }
    ctx.beginPath();
    if (tool === "line") {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      return;
    }
    const box = shapeBox(a, { x: x1, y: y1 }, shift && tool !== "line");
    if (tool === "rect") {
      if (paintFill) ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      return;
    }
    ctx.ellipse(
      box.x + box.w / 2,
      box.y + box.h / 2,
      Math.max(box.w / 2, 0.5),
      Math.max(box.h / 2, 0.5),
      0, 0, Math.PI * 2
    );
    if (paintFill) ctx.fill();
    ctx.stroke();
  }

  function drawContained(ctx, img, x, y, w, h) {
    if (w < 1 || h < 1 || !img.width || !img.height) return;
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function placeBox(a, b) {
    const box = shapeBox(a, b, false);
    if (box.w >= 8 && box.h >= 8) return box;
    const canvas = paintCanvas();
    const side = Math.round(Math.min(canvas.width, canvas.height) * 0.45);
    return {
      x: Math.round(b.x - side / 2),
      y: Math.round(b.y - side / 2),
      w: side,
      h: side
    };
  }

  function fittedRect(img, box) {
    const scale = Math.min(box.w / img.width, box.h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    return {
      x: box.x + (box.w - dw) / 2,
      y: box.y + (box.h - dh) / 2,
      w: dw,
      h: dh
    };
  }

  function imageDataUrl(img) {
    const copy = document.createElement("canvas");
    copy.width = img.naturalWidth || img.width;
    copy.height = img.naturalHeight || img.height;
    copy.getContext("2d").drawImage(img, 0, 0);
    return copy.toDataURL("image/png");
  }

  function drawVector(ctx, spec) {
    if (!spec) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = spec.size || 8;
    ctx.strokeStyle = spec.color || paintColor;
    ctx.fillStyle = spec.fillColor || "transparent";
    ctx.globalCompositeOperation = "source-over";
    if (spec.shape === "line") {
      ctx.beginPath();
      ctx.moveTo(spec.x1, spec.y1);
      ctx.lineTo(spec.x2, spec.y2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (spec.shape === "rect") {
      if (spec.fillColor) ctx.fillRect(spec.x, spec.y, spec.w, spec.h);
      ctx.strokeRect(spec.x, spec.y, spec.w, spec.h);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.ellipse(
      spec.x + spec.w / 2,
      spec.y + spec.h / 2,
      Math.max(spec.w / 2, 0.5),
      Math.max(spec.h / 2, 0.5),
      0, 0, Math.PI * 2
    );
    if (spec.fillColor) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function shapeEnds(a, b, shift) {
    let x2 = b.x;
    let y2 = b.y;
    if (shift) {
      const angle = Math.atan2(y2 - a.y, x2 - a.x);
      const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x2 - a.x, y2 - a.y);
      x2 = a.x + Math.cos(snap) * len;
      y2 = a.y + Math.sin(snap) * len;
    }
    return { x1: a.x, y1: a.y, x2: x2, y2: y2 };
  }

  function shapeSpec(a, b, shift, tool) {
    if (tool === "line") {
      const ends = shapeEnds(a, b, shift);
      return {
        shape: "line",
        x1: ends.x1, y1: ends.y1, x2: ends.x2, y2: ends.y2,
        color: paintColor,
        fillColor: "",
        size: paintSize
      };
    }
    const box = shapeBox(a, b, shift);
    return {
      shape: tool,
      x: box.x, y: box.y, w: box.w, h: box.h,
      color: paintColor,
      fillColor: paintFill ? paintFillColor : "",
      size: paintSize
    };
  }

  function commitShape(a, b, shift) {
    const spec = shapeSpec(a, b, shift, paintTool);
    if (!spec) return;
    if (spec.shape === "line" && Math.hypot(spec.x2 - spec.x1, spec.y2 - spec.y1) < 4) return;
    if (spec.shape !== "line" && spec.w < 4 && spec.h < 4) return;
    const names = { line: "Линия", rect: "Прямоугольник", ellipse: "Эллипс" };
    const layer = {
      id: store.uid(),
      name: names[spec.shape] || "Фигура",
      kind: "shape",
      shape: spec.shape,
      visible: true,
      ink: true,
      ready: true,
      x: spec.x || 0,
      y: spec.y || 0,
      w: spec.w || 0,
      h: spec.h || 0,
      x1: spec.x1 || 0,
      y1: spec.y1 || 0,
      x2: spec.x2 || 0,
      y2: spec.y2 || 0,
      color: spec.color,
      fillColor: spec.fillColor,
      size: spec.size
    };
    const at = paintLayers.findIndex(function (item) { return item.id === paintActive; });
    paintLayers.splice(at + 1, 0, layer);
    paintActive = layer.id;
    paintTool = "select";
    markTools();
    renderLayerList();
    syncShapeColors(layer);
    rememberStack({ op: "add", id: layer.id });
  }

  function syncShapeColors(layer) {
    const stroke = document.getElementById("paint-color");
    const fill = document.getElementById("paint-fill-color");
    const check = document.getElementById("paint-fill");
    const size = document.getElementById("paint-size");
    if (!layer) return;
    if (layer.kind === "text") {
      syncTextStyle(layer);
      return;
    }
    if (layer.kind !== "shape") return;
    paintColor = layer.color || paintColor;
    if (stroke) stroke.value = paintColor;
    paintSize = layer.size || paintSize;
    if (size) size.value = String(paintSize);
    if (layer.shape === "line") return;
    paintFill = !!layer.fillColor;
    if (check) check.checked = paintFill;
    if (layer.fillColor) {
      paintFillColor = layer.fillColor;
      if (fill) fill.value = paintFillColor;
    }
  }

  function markTextStyles() {
    const map = [
      ["paint-bold", paintBold],
      ["paint-italic", paintItalic],
      ["paint-underline", paintUnderline],
      ["paint-strike", paintStrike]
    ];
    map.forEach(function (pair) {
      const node = document.getElementById(pair[0]);
      if (node) node.classList.toggle("is-on", !!pair[1]);
    });
    const frame = document.getElementById("paint-frame");
    const outline = document.getElementById("paint-outline");
    if (frame) frame.checked = paintFrame;
    if (outline) outline.checked = paintOutline;
  }

  function syncTextStyle(layer) {
    if (!layer || layer.kind !== "text") return;
    const stroke = document.getElementById("paint-color");
    const size = document.getElementById("paint-size");
    paintColor = layer.color || paintColor;
    if (stroke) stroke.value = paintColor;
    paintSize = Math.max(1, Math.min(80, Math.round(textFontSize(layer) / 3)));
    if (size) size.value = String(paintSize);
    paintBold = !!layer.bold;
    paintItalic = !!layer.italic;
    paintUnderline = !!layer.underline;
    paintStrike = !!layer.strike;
    paintFrame = !!layer.frame;
    paintOutline = !!layer.outline;
    markTextStyles();
  }

  function commitText(point, value) {
    const style = textDefaults();
    const layer = {
      id: store.uid(),
      name: "Текст",
      kind: "text",
      visible: true,
      ink: true,
      ready: true,
      text: value,
      x: point.x,
      y: point.y,
      w: 0,
      h: 0,
      color: style.color,
      size: style.size,
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      strike: style.strike,
      frame: style.frame,
      outline: style.outline
    };
    fitTextBox(layer);
    layer.x = Math.round(point.x - layer.w / 2);
    layer.y = Math.round(point.y - layer.h / 2);
    const at = paintLayers.findIndex(function (item) { return item.id === paintActive; });
    paintLayers.splice(at + 1, 0, layer);
    paintActive = layer.id;
    paintTool = "select";
    markTools();
    renderLayerList();
    syncTextStyle(layer);
    rememberStack({ op: "add", id: layer.id });
  }

  function openTextPop(initial, onDone) {
    const pop = document.getElementById("pop");
    if (!pop) return;
    pop.classList.remove("hidden");
    pop.innerHTML = '<div class="pop-card text-card" role="dialog" aria-label="Текст на холсте">' +
      '<div class="pop-head"><h2>Текст</h2><button type="button" data-pop-close>×</button></div>' +
      '<label class="text-pop-field">Надпись<textarea id="paint-text-input" rows="4" spellcheck="false"></textarea></label>' +
      '<div class="row text-pop-actions">' +
      '<button type="button" class="primary" id="paint-text-ok">Готово</button>' +
      '<button type="button" data-pop-close>Отмена</button></div></div>';
    const field = pop.querySelector("#paint-text-input");
    field.value = initial == null ? "" : String(initial);
    function close() {
      pop.classList.add("hidden");
      if (pop._textKey) {
        document.removeEventListener("keydown", pop._textKey, true);
        pop._textKey = null;
      }
      if (pop._textAway) {
        pop.removeEventListener("click", pop._textAway);
        pop._textAway = null;
      }
    }
    function accept() {
      const value = field.value;
      close();
      if (onDone) onDone(value);
    }
    pop.querySelectorAll("[data-pop-close]").forEach(function (button) {
      button.addEventListener("click", close);
    });
    pop.querySelector("#paint-text-ok").addEventListener("click", accept);
    pop._textAway = function (event) { if (event.target === pop) close(); };
    pop.addEventListener("click", pop._textAway);
    pop._textKey = function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        accept();
      }
    };
    document.addEventListener("keydown", pop._textKey, true);
    setTimeout(function () {
      field.focus();
      field.select();
    }, 0);
  }

  function editTextLayer(layer) {
    if (!layer || layer.kind !== "text") return;
    openTextPop(layer.text || "", function (next) {
      rememberLayer(layer);
      layer.text = next;
      fitTextBox(layer);
      layer.ink = layerHasInk(layer);
      present();
      savePaint();
      scheduleSave();
    });
  }

  function paintSelectedText(mutate) {
    const layer = activeLayer();
    if (paintTool !== "select" || !layer || layer.kind !== "text") return;
    mutate(layer);
    fitTextBox(layer);
    layer.ink = layerHasInk(layer);
    savePaint();
    present();
    scheduleSave();
  }

  function rememberStack(entry) {
    paintUndo.push(entry);
    if (paintUndo.length > 12) paintUndo.shift();
  }

  function snapshotLayer(layer) {
    if (!layer) return null;
    if (layer.kind === "shape") {
      return {
        kind: "shape",
        name: layer.name,
        shape: layer.shape,
        visible: layer.visible !== false,
        x: layer.x, y: layer.y, w: layer.w, h: layer.h,
        x1: layer.x1, y1: layer.y1, x2: layer.x2, y2: layer.y2,
        color: layer.color,
        fillColor: layer.fillColor || "",
        size: layer.size || 8
      };
    }
    if (layer.kind === "text") {
      return {
        kind: "text",
        name: layer.name,
        visible: layer.visible !== false,
        text: layer.text || "",
        x: layer.x, y: layer.y, w: layer.w, h: layer.h,
        color: layer.color,
        size: layer.size || 32,
        bold: !!layer.bold,
        italic: !!layer.italic,
        underline: !!layer.underline,
        strike: !!layer.strike,
        frame: !!layer.frame,
        outline: !!layer.outline
      };
    }
    if (layer.kind === "image" && layer.img) {
      return {
        kind: "image",
        name: layer.name,
        visible: layer.visible !== false,
        x: layer.x, y: layer.y, w: layer.w, h: layer.h,
        src: layer.src,
        img: layer.img
      };
    }
    return null;
  }

  function layerFromSnapshot(snap, id) {
    const layer = {
      id: id || store.uid(),
      name: snap.name || "Фигура",
      kind: snap.kind,
      visible: snap.visible !== false,
      ink: true,
      ready: true
    };
    if (snap.kind === "shape") {
      layer.shape = snap.shape || "rect";
      layer.x = snap.x || 0;
      layer.y = snap.y || 0;
      layer.w = snap.w || 0;
      layer.h = snap.h || 0;
      layer.x1 = snap.x1 || 0;
      layer.y1 = snap.y1 || 0;
      layer.x2 = snap.x2 || 0;
      layer.y2 = snap.y2 || 0;
      layer.color = snap.color || "#f3ead8";
      layer.fillColor = snap.fillColor || "";
      layer.size = snap.size || 8;
      return layer;
    }
    if (snap.kind === "text") {
      layer.name = snap.name || "Текст";
      layer.text = snap.text || "";
      layer.x = snap.x || 0;
      layer.y = snap.y || 0;
      layer.w = snap.w || 0;
      layer.h = snap.h || 0;
      layer.color = snap.color || "#f3ead8";
      layer.size = snap.size || 32;
      layer.bold = !!snap.bold;
      layer.italic = !!snap.italic;
      layer.underline = !!snap.underline;
      layer.strike = !!snap.strike;
      layer.frame = !!snap.frame;
      layer.outline = !!snap.outline;
      if (!layer.w || !layer.h) fitTextBox(layer);
      return layer;
    }
    layer.src = snap.src || "";
    layer.img = snap.img || null;
    layer.x = snap.x || 0;
    layer.y = snap.y || 0;
    layer.w = snap.w || 0;
    layer.h = snap.h || 0;
    layer.touched = false;
    return layer;
  }

  function shiftedSnap(snap, dx, dy) {
    const next = Object.assign({}, snap);
    if (next.shape === "line") {
      next.x1 += dx;
      next.y1 += dy;
      next.x2 += dx;
      next.y2 += dy;
    } else {
      next.x += dx;
      next.y += dy;
    }
    return next;
  }

  function placeSnapshot(snap) {
    const layer = layerFromSnapshot(snap);
    const at = paintLayers.findIndex(function (item) { return item.id === paintActive; });
    paintLayers.splice(at + 1, 0, layer);
    paintActive = layer.id;
    paintTool = "select";
    markTools();
    renderLayerList();
    syncShapeColors(layer);
    present();
    savePaint();
    scheduleSave();
    return layer;
  }

  function cutSelection() {
    const layer = activeLayer();
    const snap = snapshotLayer(layer);
    if (!snap) return;
    paintClip = snap;
    const index = paintLayers.findIndex(function (item) { return item.id === layer.id; });
    if (index < 0) return;
    if (paintLayers.length < 2) {
      document.getElementById("paint-clear").click();
      return;
    }
    rememberStack({ op: "remove", index: index, snap: Object.assign({ id: layer.id }, snap) });
    paintLayers.splice(index, 1);
    paintActive = paintLayers[Math.max(0, index - 1)].id;
    renderLayerList();
    present();
    savePaint();
    scheduleSave();
  }

  function pasteClip() {
    if (!paintClip) return;
    const snap = shiftedSnap(paintClip, 24, 24);
    paintClip = snap;
    const layer = placeSnapshot(snap);
    rememberStack({ op: "add", id: layer.id });
  }

  function pasteImageFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      const view = paintCanvas();
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const scale = Math.min(1, view.width * 0.8 / w, view.height * 0.8 / h);
      w *= scale;
      h *= scale;
      const layer = placeSnapshot({
        kind: "image",
        name: "Картинка",
        x: (view.width - w) / 2,
        y: (view.height - h) / 2,
        w: w,
        h: h,
        src: imageDataUrl(img),
        img: img
      });
      rememberStack({ op: "add", id: layer.id });
    };
    img.src = url;
  }

  function paintOpen() {
    const paint = document.getElementById("paint");
    return !!(paint && !paint.classList.contains("hidden") && !viewCodex);
  }

  function typingTarget(node) {
    if (!node || !node.tagName) return false;
    const tag = node.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
  }

  function undoPaint() {
    const shot = paintUndo.pop();
    if (!shot) return;
    if (shot.op === "add") {
      const index = paintLayers.findIndex(function (item) { return item.id === shot.id; });
      if (index < 0) return;
      paintLayers.splice(index, 1);
      if (!paintLayers.length) paintLayers.push(makeLayer("Слой 1"));
      paintActive = paintLayers[Math.max(0, index - 1)].id;
      renderLayerList();
      present();
      savePaint();
      scheduleSave();
      return;
    }
    if (shot.op === "remove") {
      const layer = layerFromSnapshot(shot.snap, shot.snap.id);
      const index = Math.max(0, Math.min(shot.index, paintLayers.length));
      paintLayers.splice(index, 0, layer);
      paintActive = layer.id;
      paintTool = "select";
      markTools();
      renderLayerList();
      syncShapeColors(layer);
      present();
      savePaint();
      scheduleSave();
      return;
    }
    const layer = layerById(shot.id);
    if (!layer) return;
    if (shot.geom && layer.kind === "shape") {
      layer.x = shot.geom.x;
      layer.y = shot.geom.y;
      layer.w = shot.geom.w;
      layer.h = shot.geom.h;
      layer.x1 = shot.geom.x1;
      layer.y1 = shot.geom.y1;
      layer.x2 = shot.geom.x2;
      layer.y2 = shot.geom.y2;
      layer.color = shot.geom.color;
      layer.fillColor = shot.geom.fillColor;
      layer.size = shot.geom.size;
      layer.ink = true;
      present();
      savePaint();
      scheduleSave();
      return;
    }
    if (shot.text && layer.kind === "text") {
      layer.x = shot.text.x;
      layer.y = shot.text.y;
      layer.w = shot.text.w;
      layer.h = shot.text.h;
      layer.text = shot.text.text;
      layer.color = shot.text.color;
      layer.size = shot.text.size;
      layer.bold = !!shot.text.bold;
      layer.italic = !!shot.text.italic;
      layer.underline = !!shot.text.underline;
      layer.strike = !!shot.text.strike;
      layer.frame = !!shot.text.frame;
      layer.outline = !!shot.text.outline;
      layer.ink = layerHasInk(layer);
      syncTextStyle(layer);
      present();
      savePaint();
      scheduleSave();
      return;
    }
    if (shot.box && layer.kind === "image") {
      layer.x = shot.box.x;
      layer.y = shot.box.y;
      layer.w = shot.box.w;
      layer.h = shot.box.h;
      if (shot.img) {
        layer.img = shot.img;
        layer.src = shot.src || "";
        layer.ink = true;
      }
      present();
      savePaint();
      scheduleSave();
      return;
    }
    if (!shot.data || !layer.canvas || layer.canvas.width !== shot.data.width) return;
    layer.canvas.getContext("2d").putImageData(shot.data, 0, 0);
    layer.ready = true;
    layer.ink = true;
    present();
    savePaint();
    scheduleSave();
  }

  function paintSelectedShape(mutate) {
    const layer = activeLayer();
    if (paintTool !== "select" || !layer || layer.kind !== "shape") return;
    mutate(layer);
    savePaint();
    present();
    scheduleSave();
  }

  function commitImage(a, b) {
    if (!paintPending) return;
    const fitted = fittedRect(paintPending.img, placeBox(a, b));
    const layer = blankImageLayer(paintPending.name);
    layer.img = paintPending.img;
    layer.src = imageDataUrl(paintPending.img);
    layer.x = fitted.x;
    layer.y = fitted.y;
    layer.w = fitted.w;
    layer.h = fitted.h;
    layer.ink = true;
    layer.ready = true;
    const at = paintLayers.findIndex(function (item) { return item.id === paintActive; });
    paintLayers.splice(at + 1, 0, layer);
    paintActive = layer.id;
    paintPending = null;
    paintTool = "select";
    markTools();
    renderLayerList();
    rememberStack({ op: "add", id: layer.id });
  }

  function savePaint() {
    const page = activePage();
    const canvas = paintCanvas();
    if (!page || !canvas || !canvas.width || !paintLayers.length) return;
    const pending = paintLayers.some(function (layer) { return !layer.ready; });
    if (!pending) {
      paintLayers.forEach(function (layer) {
        if (layer.ready) layer.ink = layerHasInk(layer);
      });
      composite(false);
      page.paint = paintLayers.some(function (layer) { return layer.ink; }) ? canvas.toDataURL("image/png") : "";
    }
    page.paintLayers = paintLayers.map(function (layer) {
      if (layer.kind === "image") {
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          kind: "image",
          x: layer.x,
          y: layer.y,
          w: layer.w,
          h: layer.h,
          src: layer.ink ? layer.src : ""
        };
      }
      if (layer.kind === "shape") {
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          kind: "shape",
          shape: layer.shape,
          x: layer.x, y: layer.y, w: layer.w, h: layer.h,
          x1: layer.x1, y1: layer.y1, x2: layer.x2, y2: layer.y2,
          color: layer.color,
          fillColor: layer.fillColor || "",
          size: layer.size || 8
        };
      }
      if (layer.kind === "text") {
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          kind: "text",
          text: layer.text || "",
          x: layer.x, y: layer.y, w: layer.w, h: layer.h,
          color: layer.color,
          size: layer.size || 32,
          bold: !!layer.bold,
          italic: !!layer.italic,
          underline: !!layer.underline,
          strike: !!layer.strike,
          frame: !!layer.frame,
          outline: !!layer.outline
        };
      }
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        kind: "paint",
        src: layer.ink ? (layer.ready && layer.canvas ? layer.canvas.toDataURL("image/png") : layer.src) : ""
      };
    });
  }

  function drawPaint(page) {
    const canvas = paintCanvas();
    if (!canvas || !project) return;
    const width = project.stage.width;
    const height = project.stage.height;
    canvas.width = width;
    canvas.height = height;
    paintUndo = [];
    paintStamp = null;
    paintDrag = null;
    paintDrawing = false;
    const token = ++paintToken;
    let specs = page && Array.isArray(page.paintLayers) ? page.paintLayers : null;
    if (!specs || !specs.length) {
      specs = [{
        id: store.uid(),
        name: "Слой 1",
        visible: true,
        src: page && page.paint ? page.paint : ""
      }];
    }
    paintLayers = specs.map(function (spec, index) {
      if (spec.kind === "shape") {
        return {
          id: spec.id || store.uid(),
          name: spec.name || "Фигура",
          kind: "shape",
          shape: spec.shape || "rect",
          visible: spec.visible !== false,
          ink: true,
          ready: true,
          x: Number(spec.x) || 0,
          y: Number(spec.y) || 0,
          w: Number(spec.w) || 0,
          h: Number(spec.h) || 0,
          x1: Number(spec.x1) || 0,
          y1: Number(spec.y1) || 0,
          x2: Number(spec.x2) || 0,
          y2: Number(spec.y2) || 0,
          color: spec.color || "#f3ead8",
          fillColor: spec.fillColor || "",
          size: Number(spec.size) || 8
        };
      }
      if (spec.kind === "text") {
        const layer = {
          id: spec.id || store.uid(),
          name: spec.name || "Текст",
          kind: "text",
          visible: spec.visible !== false,
          ink: true,
          ready: true,
          text: spec.text || "",
          x: Number(spec.x) || 0,
          y: Number(spec.y) || 0,
          w: Number(spec.w) || 0,
          h: Number(spec.h) || 0,
          color: spec.color || "#f3ead8",
          size: Number(spec.size) || 32,
          bold: !!spec.bold,
          italic: !!spec.italic,
          underline: !!spec.underline,
          strike: !!spec.strike,
          frame: !!spec.frame,
          outline: !!spec.outline
        };
        if (!layer.w || !layer.h) fitTextBox(layer);
        layer.ink = layerHasInk(layer);
        return layer;
      }
      if (spec.kind === "image") {
        const layer = blankImageLayer(spec.name || "Картинка");
        layer.id = spec.id || layer.id;
        layer.visible = spec.visible !== false;
        layer.src = spec.src || "";
        layer.x = Number(spec.x) || 0;
        layer.y = Number(spec.y) || 0;
        layer.w = Number(spec.w) || 0;
        layer.h = Number(spec.h) || 0;
        layer.ink = !!layer.src;
        layer.ready = !layer.src;
        return layer;
      }
      const layer = makeLayer(spec.name || ("Слой " + (index + 1)));
      layer.id = spec.id || layer.id;
      layer.visible = spec.visible !== false;
      layer.src = spec.src || "";
      layer.ink = !!layer.src;
      layer.ready = !layer.src;
      return layer;
    });
    paintActive = paintLayers[paintLayers.length - 1].id;
    paintLayers.forEach(function (layer) {
      if (!layer.src) return;
      const img = new Image();
      img.onload = function () {
        if (token !== paintToken) return;
        if (layer.kind === "image") {
          layer.img = img;
          if (!layer.w || !layer.h) {
            const fitted = fittedRect(img, { x: 0, y: 0, w: width, h: height });
            layer.x = fitted.x;
            layer.y = fitted.y;
            layer.w = fitted.w;
            layer.h = fitted.h;
          }
          layer.ready = true;
          layer.ink = true;
          present();
          return;
        }
        if (layer.touched) return;
        layer.canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        layer.ready = true;
        layer.ink = true;
        present();
      };
      img.src = layer.src;
    });
    present();
    renderLayerList();
  }

  function bindPaint() {
    if (paintReady) return;
    paintReady = true;
    const canvas = paintCanvas();

    function strokeTo(layer, point) {
      const ctx = layer.canvas.getContext("2d");
      styleLayer(ctx, paintTool === "eraser");
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }

    function cursorFor(handle) {
      if (handle === "nw" || handle === "se") return "nwse-resize";
      if (handle === "ne" || handle === "sw") return "nesw-resize";
      if (handle === "n" || handle === "s") return "ns-resize";
      if (handle === "e" || handle === "w") return "ew-resize";
      return "move";
    }

    function previewShape(a, b, shift) {
      composite(false);
      drawVector(canvas.getContext("2d"), shapeSpec(a, b, shift, paintTool));
    }

    function dragBox(layer) {
      if (layer.shape === "line") return { x1: layer.x1, y1: layer.y1, x2: layer.x2, y2: layer.y2 };
      return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
    }

    function previewImage(a, b) {
      const box = placeBox(a, b);
      composite(false);
      const view = canvas.getContext("2d");
      view.strokeStyle = "#e6c36a";
      view.lineWidth = 2;
      view.strokeRect(box.x, box.y, box.w, box.h);
      drawContained(view, paintPending.img, box.x, box.y, box.w, box.h);
    }

    canvas.addEventListener("dblclick", function (event) {
      if (viewCodex || paintTool !== "select") return;
      const point = paintPoint(event, canvas);
      const layer = objectAt(point) || activeLayer();
      if (layer && layer.kind === "text" && hitBody(point, layer)) editTextLayer(layer);
    });

    canvas.addEventListener("pointerdown", function (event) {
      if (viewCodex) return;
      paintStart = paintPoint(event, canvas);
      if (paintTool === "text") {
        const point = { x: paintStart.x, y: paintStart.y };
        openTextPop("Текст", function (value) {
          if (!String(value || "").trim()) return;
          commitText(point, value);
          savePaint();
          present();
          scheduleSave();
        });
        return;
      }
      if (paintTool === "select") {
        const current = activeLayer();
        let handle = "";
        let layer = null;
        if (current && current.visible && isObjectLayer(current)) {
          handle = hitHandle(paintStart, current);
          const onBody = current.kind === "shape"
            ? hitShape(paintStart, current)
            : hitBody(paintStart, current);
          if (handle || onBody) layer = current;
        }
        if (!layer) layer = objectAt(paintStart);
        if (!layer) return;
        paintActive = layer.id;
        markActiveLayer();
        syncShapeColors(layer);
        paintDrag = {
          mode: handle ? "resize" : "move",
          handle: handle,
          box: dragBox(layer),
          startSize: layer.kind === "text" ? textFontSize(layer) : 0
        };
        rememberLayer(layer);
        paintDrawing = true;
        try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* жест уже закончился */ }
        present();
        return;
      }
      if (paintShape(paintTool)) {
        paintDrawing = true;
        try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* жест уже закончился */ }
        previewShape(paintStart, paintStart, event.shiftKey);
        return;
      }
      if (paintTool === "image") {
        if (!paintPending) return;
        paintDrawing = true;
        try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* жест уже закончился */ }
        previewImage(paintStart, paintStart);
        return;
      }
      const layer = paintTarget();
      if (!layer || !layer.visible || !layer.canvas) return;
      paintDrawing = true;
      try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* жест уже закончился */ }
      rememberLayer(layer);
      layer.touched = true;
      layer.ready = true;
      layer.ink = true;
      const ctx = layer.canvas.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(paintStart.x, paintStart.y);
      strokeTo(layer, paintStart);
      present();
    });
    canvas.addEventListener("pointermove", function (event) {
      const point = paintPoint(event, canvas);
      if (!paintDrawing && paintTool === "select") {
        const current = activeLayer();
        const handle = current && isObjectLayer(current) ? hitHandle(point, current) : "";
        const onBody = current && (
          current.kind === "shape"
            ? hitShape(point, current)
            : (current.kind === "image" || current.kind === "text") && hitBody(point, current)
        );
        if (handle) canvas.style.cursor = handle === "a" || handle === "b" ? "crosshair" : cursorFor(handle);
        else if (onBody || objectAt(point)) canvas.style.cursor = "move";
        else canvas.style.cursor = "default";
        return;
      }
      if (!paintDrawing) return;
      if (paintTool === "select" && paintDrag) {
        const layer = activeLayer();
        if (!layer || !isObjectLayer(layer)) return;
        const dx = point.x - paintStart.x;
        const dy = point.y - paintStart.y;
        if (paintDrag.mode === "move" && layer.shape === "line") {
          layer.x1 = paintDrag.box.x1 + dx;
          layer.y1 = paintDrag.box.y1 + dy;
          layer.x2 = paintDrag.box.x2 + dx;
          layer.y2 = paintDrag.box.y2 + dy;
        } else if (paintDrag.mode === "move") {
          layer.x = paintDrag.box.x + dx;
          layer.y = paintDrag.box.y + dy;
        } else {
          applyResize(layer, paintDrag.handle, point, event.shiftKey);
          if (layer.kind === "text") {
            const baseW = Math.max(1, paintDrag.box.w);
            const baseH = Math.max(1, paintDrag.box.h);
            const ratio = Math.max(layer.w / baseW, layer.h / baseH);
            layer.size = Math.max(8, Math.round((paintDrag.startSize || 32) * ratio));
            fitTextBox(layer);
          }
        }
        present();
        return;
      }
      if (paintShape(paintTool)) {
        previewShape(paintStart, point, event.shiftKey);
        return;
      }
      if (paintTool === "image" && paintPending) {
        previewImage(paintStart, point);
        return;
      }
      const layer = paintTarget();
      if (!layer || !layer.canvas) return;
      strokeTo(layer, point);
      present();
    });
    function finish(event) {
      if (!paintDrawing) return;
      paintDrawing = false;
      paintDrag = null;
      if (paintTool === "image" && paintPending && event.clientX != null) {
        commitImage(paintStart, paintPoint(event, canvas));
      }
      if (paintShape(paintTool) && event.clientX != null) {
        commitShape(paintStart, paintPoint(event, canvas), event.shiftKey);
      }
      paintStamp = null;
      savePaint();
      present();
      scheduleSave();
    }
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);

    document.querySelectorAll("[data-paint-tool]").forEach(function (button) {
      button.addEventListener("click", function () {
        paintTool = button.getAttribute("data-paint-tool");
        canvas.style.cursor = paintTool === "select" ? "default" : "crosshair";
        markTools();
        present();
      });
    });
    document.getElementById("paint-color").addEventListener("input", function (event) {
      paintColor = event.target.value;
      paintSelectedShape(function (layer) { layer.color = paintColor; });
      paintSelectedText(function (layer) { layer.color = paintColor; });
    });
    const fillColor = document.getElementById("paint-fill-color");
    if (fillColor) fillColor.addEventListener("input", function (event) {
      paintFillColor = event.target.value;
      paintFill = true;
      const check = document.getElementById("paint-fill");
      if (check) check.checked = true;
      paintSelectedShape(function (layer) {
        if (layer.shape === "line") return;
        layer.fillColor = paintFillColor;
      });
    });
    document.getElementById("paint-size").addEventListener("input", function (event) {
      paintSize = Number(event.target.value) || 8;
      paintSelectedShape(function (layer) { layer.size = paintSize; });
      paintSelectedText(function (layer) { layer.size = Math.max(8, Math.round(paintSize * 3)); });
    });
    document.getElementById("paint-fill").addEventListener("change", function (event) {
      paintFill = !!event.target.checked;
      paintSelectedShape(function (layer) {
        if (layer.shape === "line") return;
        layer.fillColor = paintFill ? paintFillColor : "";
      });
    });
    function bindTextToggle(id, key) {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener("click", function () {
        if (key === "bold") paintBold = !paintBold;
        if (key === "italic") paintItalic = !paintItalic;
        if (key === "underline") paintUnderline = !paintUnderline;
        if (key === "strike") paintStrike = !paintStrike;
        markTextStyles();
        paintSelectedText(function (layer) {
          layer.bold = paintBold;
          layer.italic = paintItalic;
          layer.underline = paintUnderline;
          layer.strike = paintStrike;
        });
      });
    }
    bindTextToggle("paint-bold", "bold");
    bindTextToggle("paint-italic", "italic");
    bindTextToggle("paint-underline", "underline");
    bindTextToggle("paint-strike", "strike");
    const frameBox = document.getElementById("paint-frame");
    if (frameBox) frameBox.addEventListener("change", function (event) {
      paintFrame = !!event.target.checked;
      paintSelectedText(function (layer) { layer.frame = paintFrame; });
    });
    const outlineBox = document.getElementById("paint-outline");
    if (outlineBox) outlineBox.addEventListener("change", function (event) {
      paintOutline = !!event.target.checked;
      paintSelectedText(function (layer) { layer.outline = paintOutline; });
    });
    markTextStyles();
    document.getElementById("paint-image").addEventListener("click", function () {
      document.getElementById("paint-image-file").click();
    });
    document.getElementById("paint-image-file").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Картинка";
        paintPending = { img: img, name: name };
        paintTool = "image";
        markTools();
      };
      img.src = url;
    });
    document.getElementById("paint-undo").addEventListener("click", undoPaint);
    document.getElementById("paint-clear").addEventListener("click", function () {
      const layer = activeLayer();
      if (!layer) return;
      rememberLayer(layer);
      if (layer.kind === "image") {
        layer.img = null;
        layer.src = "";
        layer.ink = false;
        layer.ready = true;
        layer.w = 0;
        layer.h = 0;
      } else if (layer.kind === "shape") {
        layer.ink = false;
        layer.w = 0;
        layer.h = 0;
        layer.x2 = layer.x1;
        layer.y2 = layer.y1;
        layer.fillColor = "";
      } else if (layer.kind === "text") {
        layer.text = "";
        layer.ink = false;
        layer.w = 0;
        layer.h = 0;
      } else if (layer.canvas) {
        const ctx = layer.canvas.getContext("2d");
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.ink = false;
        layer.ready = true;
        layer.touched = true;
      }
      present();
      savePaint();
      scheduleSave();
    });
    document.getElementById("paint-download").addEventListener("click", function () {
      savePaint();
      const view = paintCanvas();
      const copy = document.createElement("canvas");
      copy.width = view.width;
      copy.height = view.height;
      copy.getContext("2d").drawImage(view, 0, 0);
      present();
      copy.toBlob(function (blob) {
        if (!blob) return;
        const page = activePage();
        download(blob, (page && page.name ? page.name : "холст") + ".png");
      }, "image/png");
    });

    document.getElementById("layer-add").addEventListener("click", function () {
      const layer = makeLayer("Слой " + (paintLayers.length + 1));
      const at = paintLayers.findIndex(function (item) { return item.id === paintActive; });
      paintLayers.splice(at + 1, 0, layer);
      paintActive = layer.id;
      renderLayerList();
      savePaint();
      scheduleSave();
    });
    function moveLayer(step) {
      const index = paintLayers.findIndex(function (item) { return item.id === paintActive; });
      const next = index + step;
      if (index < 0 || next < 0 || next >= paintLayers.length) return;
      const layer = paintLayers[index];
      paintLayers.splice(index, 1);
      paintLayers.splice(next, 0, layer);
      renderLayerList();
      savePaint();
      present();
      scheduleSave();
    }
    document.getElementById("layer-up").addEventListener("click", function () { moveLayer(1); });
    document.getElementById("layer-down").addEventListener("click", function () { moveLayer(-1); });
    document.getElementById("layer-delete").addEventListener("click", function () {
      if (paintLayers.length < 2) {
        document.getElementById("paint-clear").click();
        return;
      }
      const index = paintLayers.findIndex(function (item) { return item.id === paintActive; });
      if (index < 0) return;
      paintLayers.splice(index, 1);
      paintActive = paintLayers[Math.max(0, index - 1)].id;
      renderLayerList();
      present();
      savePaint();
      scheduleSave();
    });
    document.getElementById("paint-layer-list").addEventListener("click", function (event) {
      const row = event.target.closest("[data-layer]");
      if (!row) return;
      const layer = layerById(row.getAttribute("data-layer"));
      if (!layer) return;
      if (event.target.closest("[data-layer-eye]")) {
        layer.visible = !layer.visible;
        const eye = row.querySelector("[data-layer-eye]");
        eye.classList.toggle("is-off", !layer.visible);
        eye.title = layer.visible ? "Скрыть" : "Показать";
        eye.textContent = layer.visible ? "◉" : "○";
        present();
        savePaint();
        scheduleSave();
        return;
      }
      if (event.target.closest("input")) return;
      paintActive = layer.id;
      if (layer.kind === "image" || layer.kind === "shape" || layer.kind === "text") {
        paintTool = "select";
        canvas.style.cursor = "default";
        markTools();
        syncShapeColors(layer);
      }
      markActiveLayer();
      present();
    });
    document.getElementById("paint-layer-list").addEventListener("input", function (event) {
      const row = event.target.closest("[data-layer]");
      if (!row) return;
      const layer = layerById(row.getAttribute("data-layer"));
      if (!layer) return;
      layer.name = event.target.value;
      scheduleSave();
    });
    if (!bindPaint.keys) {
      bindPaint.keys = true;
      document.addEventListener("keydown", function (event) {
        if (!paintOpen() || typingTarget(event.target)) return;
        const key = event.key.toLowerCase();
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          undoPaint();
          return;
        }
        if (key === "x") {
          event.preventDefault();
          cutSelection();
          return;
        }
        if (key === "v") {
          setTimeout(function () {
            if (Date.now() - paintPasteAt < 300) return;
            pasteClip();
          }, 40);
        }
      });
      document.addEventListener("paste", function (event) {
        if (!paintOpen() || typingTarget(event.target)) return;
        const items = event.clipboardData && event.clipboardData.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image/") === 0) {
              const file = items[i].getAsFile();
              if (!file) continue;
              event.preventDefault();
              paintPasteAt = Date.now();
              pasteImageFile(file);
              return;
            }
          }
        }
        if (!paintClip) return;
        event.preventDefault();
        paintPasteAt = Date.now();
        pasteClip();
      });
    }
  }

  function showCodex() {
    viewCodex = true;
    document.getElementById("gjs").classList.add("hidden");
    document.getElementById("paint").classList.add("hidden");
    document.getElementById("scene-editor").classList.add("hidden");
    const codex = document.getElementById("codex");
    codex.classList.remove("hidden");
    const kindSelect = document.getElementById("page-kind");
    if (kindSelect) kindSelect.value = "codex";
    window.ShirmoScenes.setContext({
      catalog: function () { return project.codex; },
      page: activePage
    });
    window.ShirmoScenes.mountCodex(codex, scheduleSave);
  }

  function captureEditor() {
    const page = activePage();
    if (!page || viewCodex) return;
    const kind = page.editKind || page.kind || "free";
    if (kind !== "free") {
      window.ShirmoScenes.commit(document.getElementById("scene-editor"), page);
      return;
    }
    if (!document.getElementById("paint").classList.contains("hidden")) savePaint();
  }

  function loadIntoEditor(page) {
    syncFxButton();
    const kind = page.editKind || page.kind || "free";
    const panel = document.getElementById("scene-editor");
    const kindSelect = document.getElementById("page-kind");
    if (viewCodex) {
      if (kindSelect) kindSelect.value = "codex";
      showCodex();
      return;
    }
    if (kindSelect) kindSelect.value = kind;
    document.getElementById("codex").classList.add("hidden");
    document.getElementById("gjs").classList.add("hidden");
    if (kind === "free") {
      document.getElementById("paint").classList.remove("hidden");
      panel.classList.add("hidden");
      drawPaint(page);
      return;
    }
    document.getElementById("paint").classList.add("hidden");
    panel.classList.remove("hidden");
    window.ShirmoScenes.mount(panel, page, scheduleSave);
  }

  function applyDevice() {
    if (!viewCodex && activePage() && (activePage().editKind || activePage().kind || "free") === "free") {
      drawPaint(activePage());
    }
  }

  function fillPages() {
    const select = document.getElementById("pages");
    navLock = true;
    select.innerHTML = "";
    project.pages.forEach(function (page) {
      const option = document.createElement("option");
      option.value = page.id;
      option.textContent = page.name;
      if (page.id === project.activePageId) option.selected = true;
      select.appendChild(option);
    });
    document.getElementById("stage-w").value = project.stage.width;
    document.getElementById("stage-h").value = project.stage.height;
    navLock = false;
    updateShowButton();
  }

  function updateShowButton() {
    const button = document.getElementById("show-scene");
    if (!button || !project) return;
    const page = activePage();
    const editing = page ? (page.editKind || page.kind || "free") : "free";
    const published = page ? (page.kind || "free") : "free";
    button.classList.toggle("primary", !page || project.shownPageId !== page.id || editing !== published);
  }

  function persist(afterMerge) {
    clearTimeout(saveTimer);
    captureEditor();
    const seen = project.rev || 0;
    saveChain = saveChain.then(function () {
      return store.getProject();
    }).then(function (fresh) {
      if (fresh && (fresh.rev || 0) > (project.rev || 0)) {
        window.ShirmoScenes.mergeRuntime(project, fresh);
      }
      if (afterMerge) afterMerge();
      project.rev = Math.max(project.rev || 0, fresh && fresh.rev || 0, seen) + 1;
      return store.saveProject(project);
    }).then(function () { live.touch(); });
    return saveChain;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 200);
  }

  function startEditor() {
    show(editorSection);
    const shownOk = project.pages.some(function (page) { return page.id === project.shownPageId; });
    if (!shownOk) project.shownPageId = project.activePageId;
    fillPages();
    if (!shownOk) persist();
    bindPaint();
    loadIntoEditor(activePage());
    live.onRefresh(async function () {
      const fresh = await store.getProject();
      if (!fresh || (fresh.rev || 0) < (project.rev || 0)) return;
      window.ShirmoScenes.mergeRuntime(project, fresh);
      project.rev = fresh.rev || project.rev;
      const codex = document.getElementById("codex");
      const panel = document.getElementById("scene-editor");
      const pop = document.getElementById("pop");
      if (pop && !pop.classList.contains("hidden") && pop.contains(document.activeElement)) return;
      if (viewCodex) {
        if (!codex.contains(document.activeElement)) window.ShirmoScenes.mountCodex(codex, scheduleSave);
        return;
      }
      if (panel.contains(document.activeElement)) return;
      if (document.getElementById("paint-canvas") === document.activeElement) return;
      const kind = activePage().editKind || activePage().kind || "free";
      if (kind !== "free") loadIntoEditor(activePage());
    });
  }

  function openShare() {
    const stage = project.stage;
    window.open(
      "index.html?view=play",
      "shirmo-share",
      "popup=yes,width=" + stage.width + ",height=" + stage.height
    );
  }

  async function ensureProject() {
    project = await store.getProject();
    if (!project) {
      project = store.createProject();
      await store.saveProject(project);
    }
    if (!project.stage) project.stage = { width: store.STAGE.width, height: store.STAGE.height };
    project.pages.forEach(function (page) {
      if (!page.editKind) page.editKind = page.kind || "free";
    });
    const hadCodex = !!project.codex;
    store.ensureCodex(project);
    if (!hadCodex) await store.saveProject(project);
  }

  function publishEditing(applyScene) {
    const page = activePage();
    if (!page) return;
    const kind = page.editKind || page.kind || "free";
    if (kind === "free") return;
    function apply() {
      page.kind = kind;
      page.scenes = page.scenes || {};
      const live = page.scenes[kind] || page.scene || store.emptyScene(kind);
      page.scenes[kind] = live;
      page.scene = live;
      if (applyScene) applyScene(live);
      project.shownPageId = page.id;
      updateShowButton();
    }
    apply();
    persist(apply);
  }

  function bindEditor() {
    window.ShirmoScenes.setRoll(publishDie);
    window.ShirmoScenes.setHit(publishHit);
    window.ShirmoScenes.setContext({
      catalog: function () { return project.codex; },
      page: activePage,
      publish: publishEditing
    });
    document.getElementById("roll-d20").addEventListener("click", function () {
      openDiePop();
    });
    const fxWrap = document.getElementById("fx-wrap");
    fxWrap.addEventListener("click", function (event) { event.stopPropagation(); });
    document.getElementById("fx-open").addEventListener("click", function () {
      document.getElementById("fx-menu").classList.toggle("hidden");
      syncFxButton();
    });
    document.getElementById("fx-menu").addEventListener("click", function (event) {
      const button = event.target.closest("[data-fx]");
      if (!button) return;
      const page = activePage();
      if (!page) return;
      page.fx = button.getAttribute("data-fx") || "";
      if (fxLive[page.fx] && page.fxRate == null) {
        page.fxRate = page.fx === "snow" ? 46 : page.fx === "fire" ? 64 : page.fx === "fog" ? 88 : 78;
        page.fxSize = page.fx === "snow" ? 40 : page.fx === "fire" ? 58 : page.fx === "fog" ? 84 : 76;
      }
      syncFxButton();
      persist();
    });
    function tuneFx() {
      const page = activePage();
      if (!page) return;
      page.fxRate = Number(document.getElementById("fx-rate").value);
      page.fxSize = Number(document.getElementById("fx-size").value);
      scheduleSave();
    }
    document.getElementById("fx-rate").addEventListener("input", tuneFx);
    document.getElementById("fx-size").addEventListener("input", tuneFx);
    document.addEventListener("click", function () {
      document.getElementById("fx-menu").classList.add("hidden");
    });

    document.getElementById("pages").addEventListener("change", function (event) {
      if (navLock) return;
      captureEditor();
      project.activePageId = event.target.value;
      loadIntoEditor(activePage());
      updateShowButton();
      persist();
    });

    document.getElementById("page-kind").addEventListener("change", function (event) {
      const page = activePage();
      captureEditor();
      const value = event.target.value || "free";
      if (value === "codex") {
        showCodex();
        return;
      }
      viewCodex = false;
      page.editKind = value;
      updateShowButton();
      loadIntoEditor(page);
      persist();
    });

    document.getElementById("page-add").addEventListener("click", function () {
      captureEditor();
      const picked = document.getElementById("page-kind").value;
      const kind = picked === "codex" ? (activePage().editKind || "free") : picked;
      const page = store.blankPage("Сцена " + (project.pages.length + 1), kind);
      project.pages.push(page);
      project.activePageId = page.id;
      fillPages();
      loadIntoEditor(page);
      updateShowButton();
      persist();
    });

    document.getElementById("page-rename").addEventListener("click", function () {
      const page = activePage();
      const name = prompt("Имя страницы", page.name);
      if (!name || !name.trim()) return;
      page.name = name.trim();
      fillPages();
      scheduleSave();
    });

    document.getElementById("page-delete").addEventListener("click", function () {
      if (project.pages.length < 2) return;
      const page = activePage();
      if (!confirm("Удалить «" + page.name + "»?")) return;
      const removed = page.id;
      project.pages = project.pages.filter(function (item) { return item.id !== page.id; });
      project.activePageId = project.pages[0].id;
      if (project.shownPageId === removed) project.shownPageId = project.activePageId;
      fillPages();
      loadIntoEditor(activePage());
      scheduleSave();
    });

    function readStage() {
      if (!viewCodex) savePaint();
      project.stage.width = clampStage(document.getElementById("stage-w").value, project.stage.width, 320, 3840);
      project.stage.height = clampStage(document.getElementById("stage-h").value, project.stage.height, 240, 2160);
      document.getElementById("stage-w").value = project.stage.width;
      document.getElementById("stage-h").value = project.stage.height;
      applyDevice();
      scheduleSave();
    }
    document.getElementById("stage-w").addEventListener("change", readStage);
    document.getElementById("stage-h").addEventListener("change", readStage);
    document.getElementById("show-scene").addEventListener("click", function () {
      captureEditor();
      const page = activePage();
      const kind = page.editKind || page.kind || "free";
      page.kind = kind;
      page.scenes = page.scenes || {};
      if (kind !== "free") {
        page.scene = page.scenes[kind] || store.emptyScene(kind);
        page.scenes[kind] = page.scene;
      }
      project.shownPageId = page.id;
      updateShowButton();
      persist();
    });
    document.getElementById("share").addEventListener("click", function () {
      persist().then(openShare);
    });

    document.getElementById("export-json").addEventListener("click", function () {
      captureEditor();
      const blob = new Blob([JSON.stringify(store.exportData(project), null, 2)], { type: "application/json" });
      download(blob, "shirmo.json");
    });

    document.getElementById("export-zip").addEventListener("click", async function () {
      captureEditor();
      const zip = new JSZip();
      zip.file("project.json", JSON.stringify(store.exportData(project), null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      download(blob, "shirmo.zip");
    });

    document.getElementById("import-file").addEventListener("click", function () {
      document.getElementById("import-input").click();
    });

    document.getElementById("import-input").addEventListener("change", async function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      let text;
      if (/\.zip$/i.test(file.name)) {
        const zip = await JSZip.loadAsync(file);
        const entry = zip.file("project.json");
        if (!entry) {
          alert("В архиве нет project.json");
          return;
        }
        text = await entry.async("string");
      } else {
        text = await file.text();
      }
      try {
        store.applyImport(project, JSON.parse(text));
      } catch (err) {
        alert(err.message || "Файл не подошёл");
        return;
      }
      await store.saveProject(project);
      live.touch();
      window.ShirmoScenes.setContext({
        catalog: function () { return project.codex; },
        page: activePage
      });
      fillPages();
      loadIntoEditor(activePage());
      applyDevice();
    });

    document.getElementById("logout").addEventListener("click", function () {
      sessionStorage.removeItem("shirmo-ok");
      location.href = "index.html";
    });

    document.getElementById("wipe").addEventListener("click", function () {
      if (!confirm("Удалить локальные данные в этом браузере? Скачанный JSON или ZIP останется на диске.")) return;
      store.dropProject().then(function () {
        sessionStorage.removeItem("shirmo-ok");
        live.touch();
        location.href = "index.html";
      });
    });
  }

  function bindGate() {
    const choices = document.getElementById("choices");
    const auth = document.getElementById("auth");
    const confirmLabel = document.getElementById("confirm-label");
    const error = document.getElementById("auth-error");

    document.getElementById("enter-player").addEventListener("click", function () {
      location.href = "index.html?view=play";
    });

    document.getElementById("enter-master").addEventListener("click", function () {
      choices.classList.add("hidden");
      auth.classList.remove("hidden");
      confirmLabel.classList.toggle("hidden", Boolean(project.password));
      document.getElementById("password-label").textContent = project.password ? "Пароль" : "Придумай пароль";
      document.getElementById("password").focus();
    });

    document.getElementById("auth-back").addEventListener("click", function () {
      auth.classList.add("hidden");
      choices.classList.remove("hidden");
      error.textContent = "";
    });

    auth.addEventListener("submit", async function (event) {
      event.preventDefault();
      error.textContent = "";
      const password = document.getElementById("password").value;
      if (password.length < 4) {
        error.textContent = "Минимум 4 символа";
        return;
      }
      if (!project.password) {
        const again = document.getElementById("confirm").value;
        if (password !== again) {
          error.textContent = "Пароли не совпали";
          return;
        }
        project.password = await store.hashPassword(password);
        await store.saveProject(project);
      } else {
        const check = await store.hashPassword(password, project.password.salt);
        if (check.hash !== project.password.hash) {
          error.textContent = "Не тот пароль";
          return;
        }
      }
      sessionStorage.setItem("shirmo-ok", "1");
      startEditor();
    });
  }

  async function boot() {
    await ensureProject();
    if (isPlay) {
      show(stageView);
      renderPlay();
      window.addEventListener("resize", fitFrame);
      live.onRefresh(async function () {
        project = await store.getProject();
        renderPlay();
      });
      return;
    }
    bindGate();
    bindEditor();
    if (sessionStorage.getItem("shirmo-ok") === "1" && project.password) startEditor();
  }

  boot().catch(function (err) {
    console.error(err);
    document.getElementById("gate-text").textContent = "Не удалось открыть локальное хранилище.";
  });
})();
