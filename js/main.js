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
  let editor = null;
  let silent = false;
  let saveTimer = 0;

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
    frame.style.width = stage.width + "px";
    frame.style.height = stage.height + "px";
    frame.style.transform = "scale(" + scale + ")";
  }

  function renderPlay() {
    const page = activePage();
    frame.srcdoc = pageDocument(page);
    fitFrame();
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function captureEditor() {
    if (!editor) return;
    const page = activePage();
    page.html = editor.getHtml();
    page.css = editor.getCss();
  }

  function loadIntoEditor(page) {
    silent = true;
    editor.setComponents(page.html || "");
    editor.setStyle(page.css || "");
    setTimeout(function () { silent = false; }, 0);
  }

  function applyDevice() {
    const devices = editor.Devices || editor.DeviceManager;
    const stage = project.stage;
    const current = devices.get("screen");
    if (current) {
      current.set({ width: stage.width + "px", height: stage.height + "px" });
    }
    editor.setDevice("screen");
    const doc = editor.Canvas.getDocument();
    if (!doc) return;
    let tag = doc.getElementById("shirmo-stage");
    if (!tag) {
      tag = doc.createElement("style");
      tag.id = "shirmo-stage";
      doc.head.appendChild(tag);
    }
    tag.textContent = "html,body{width:" + stage.width + "px;height:" + stage.height + "px;overflow:hidden;}";
  }

  function fillPages() {
    const select = document.getElementById("pages");
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
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      captureEditor();
      store.saveProject(project).then(function () { live.touch(); });
    }, 250);
  }

  function pluginFn() {
    const mod = window["gjs-blocks-basic"];
    return mod && (mod.default || mod);
  }

  function startEditor() {
    show(editorSection);
    fillPages();
    if (editor) {
      loadIntoEditor(activePage());
      applyDevice();
      return;
    }
    const blocks = pluginFn();
    const blockOpts = {
      category: "Блоки",
      flexGrid: true,
      blocks: ["column1", "column2", "column3", "column3-7", "text", "link", "image"],
      labelColumn1: "1 колонка",
      labelColumn2: "2 колонки",
      labelColumn3: "3 колонки",
      labelColumn37: "2 колонки 3/7",
      labelText: "Текст",
      labelLink: "Ссылка",
      labelImage: "Картинка"
    };
    editor = grapesjs.init({
      container: "#gjs",
      height: "100%",
      width: "auto",
      fromElement: false,
      storageManager: false,
      noticeOnUnload: false,
      plugins: [function (ed) { blocks(ed, blockOpts); }],
      deviceManager: {
        devices: [{
          id: "screen",
          name: "Планшет",
          width: project.stage.width + "px",
          height: project.stage.height + "px"
        }]
      },
      assetManager: { embedAsBase64: true },
      canvas: { styles: ["css/frame.css"] }
    });

    editor.on("load", function () {
      editor.BlockManager.add("cover", {
        label: "Обложка",
        category: "Ширма",
        content: '<section style="box-sizing:border-box;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:56px;background:#1a1612 center/cover no-repeat;color:#f3ead8;font-family:Georgia,serif;"><h1 style="margin:0;font-size:76px;font-weight:500;">Название</h1><p style="margin:12px 0 0;font-size:28px;color:#d7c4a3;">Подпись</p></section>',
        media: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h18v14H3z"/></svg>'
      });
      loadIntoEditor(activePage());
      applyDevice();
      editor.on("update", function () {
        if (!silent) scheduleSave();
      });
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
  }

  function bindEditor() {
    document.getElementById("pages").addEventListener("change", function (event) {
      captureEditor();
      project.activePageId = event.target.value;
      loadIntoEditor(activePage());
      scheduleSave();
    });

    document.getElementById("page-add").addEventListener("click", function () {
      captureEditor();
      const page = store.blankPage("Сцена " + (project.pages.length + 1));
      project.pages.push(page);
      project.activePageId = page.id;
      fillPages();
      loadIntoEditor(page);
      scheduleSave();
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
      project.pages = project.pages.filter(function (item) { return item.id !== page.id; });
      project.activePageId = project.pages[0].id;
      fillPages();
      loadIntoEditor(activePage());
      scheduleSave();
    });

    function readStage() {
      project.stage.width = clampStage(document.getElementById("stage-w").value, project.stage.width, 320, 3840);
      project.stage.height = clampStage(document.getElementById("stage-h").value, project.stage.height, 240, 2160);
      document.getElementById("stage-w").value = project.stage.width;
      document.getElementById("stage-h").value = project.stage.height;
      applyDevice();
      scheduleSave();
    }
    document.getElementById("stage-w").addEventListener("change", readStage);
    document.getElementById("stage-h").addEventListener("change", readStage);
    document.getElementById("share").addEventListener("click", function () {
      captureEditor();
      store.saveProject(project).then(function () {
        live.touch();
        openShare();
      });
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
