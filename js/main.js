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
  let paintSize = 8;
  let paintDrawing = false;
  let paintUndo = [];
  let paintToken = 0;
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
    fitFrame();
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

  function publishDie(result, label) {
    captureEditor();
    const page = activePage();
    const scene = page && page.scene;
    const ms = scene && scene.dieMs ? scene.dieMs : 2300;
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

  function publishHit(total, label) {
    captureEditor();
    appendLog((label ? label + ": " : "Урон: ") + total);
    project.hit = {
      id: store.uid(),
      total: total,
      label: label || "",
      at: Date.now()
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

  function paintBlank(ctx, canvas) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#16130f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function savePaint() {
    const page = activePage();
    const canvas = paintCanvas();
    if (!page || !canvas || !canvas.width) return;
    page.paint = canvas.toDataURL("image/png");
  }

  function drawPaint(page) {
    const canvas = paintCanvas();
    if (!canvas || !project) return;
    const width = project.stage.width;
    const height = project.stage.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    paintBlank(ctx, canvas);
    paintUndo = [];
    const src = page && page.paint ? page.paint : "";
    if (!src) return;
    const token = ++paintToken;
    const img = new Image();
    img.onload = function () {
      if (token !== paintToken) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = src;
  }

  function bindPaint() {
    if (paintReady) return;
    paintReady = true;
    const canvas = paintCanvas();
    const ctx = canvas.getContext("2d");
    function strokeTo(point) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = paintSize;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = paintTool === "eraser" ? "#16130f" : paintColor;
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
    canvas.addEventListener("pointerdown", function (event) {
      if (viewCodex) return;
      paintUndo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (paintUndo.length > 12) paintUndo.shift();
      paintDrawing = true;
      try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* жест уже закончился */ }
      const point = paintPoint(event, canvas);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      strokeTo(point);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!paintDrawing) return;
      strokeTo(paintPoint(event, canvas));
    });
    function finish() {
      if (!paintDrawing) return;
      paintDrawing = false;
      savePaint();
      scheduleSave();
    }
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    document.querySelectorAll("[data-paint-tool]").forEach(function (button) {
      button.addEventListener("click", function () {
        paintTool = button.getAttribute("data-paint-tool");
        document.querySelectorAll("[data-paint-tool]").forEach(function (chip) {
          chip.classList.toggle("is-on", chip === button);
        });
      });
    });
    document.getElementById("paint-color").addEventListener("input", function (event) {
      paintColor = event.target.value;
      paintTool = "brush";
      document.querySelectorAll("[data-paint-tool]").forEach(function (chip) {
        chip.classList.toggle("is-on", chip.getAttribute("data-paint-tool") === "brush");
      });
    });
    document.getElementById("paint-size").addEventListener("input", function (event) {
      paintSize = Number(event.target.value) || 8;
    });
    document.getElementById("paint-undo").addEventListener("click", function () {
      const shot = paintUndo.pop();
      if (!shot) return;
      ctx.putImageData(shot, 0, 0);
      savePaint();
      scheduleSave();
    });
    document.getElementById("paint-clear").addEventListener("click", function () {
      paintUndo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      paintBlank(ctx, canvas);
      savePaint();
      scheduleSave();
    });
    document.getElementById("paint-download").addEventListener("click", function () {
      savePaint();
      canvas.toBlob(function (blob) {
        if (!blob) return;
        const page = activePage();
        download(blob, (page && page.name ? page.name : "холст") + ".png");
      }, "image/png");
    });
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

  function persist() {
    clearTimeout(saveTimer);
    captureEditor();
    const seen = project.rev || 0;
    saveChain = saveChain.then(function () {
      return store.getProject();
    }).then(function (fresh) {
      if (fresh && (fresh.rev || 0) > (project.rev || 0)) {
        window.ShirmoScenes.mergeRuntime(project, fresh);
      }
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

  function bindEditor() {
    window.ShirmoScenes.setRoll(publishDie);
    window.ShirmoScenes.setHit(publishHit);
    window.ShirmoScenes.setContext({
      catalog: function () { return project.codex; },
      page: activePage
    });
    document.getElementById("roll-d20").addEventListener("click", function () {
      publishDie(1 + Math.floor(Math.random() * 20), "");
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
