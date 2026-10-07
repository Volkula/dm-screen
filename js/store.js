(function () {
  const DB_NAME = "shirmo";
  const STAGE = { width: 1368, height: 786 };

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore("kv");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function getProject() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction("kv", "readonly");
        const req = tx.objectStore("kv").get("project");
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dropProject() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete("project");
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function saveProject(project) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(project, "project");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function blankPage(name, kind) {
    const page = {
      id: uid(),
      name: name,
      kind: kind || "free",
      editKind: kind || "free",
      html: '<section class="cover"><h1>' + name + '</h1><p>Картинка, текст, что угодно.</p></section>',
      css: [
        ".cover{box-sizing:border-box;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:56px;",
        "background:#1a1612 center/cover no-repeat;color:#f3ead8;font-family:Georgia,serif;}",
        ".cover h1{margin:0;font-size:76px;font-weight:500;line-height:1.05;}",
        ".cover p{margin:12px 0 0;font-size:28px;color:#d7c4a3;}"
      ].join(""),
      scene: null
    };
    if (page.kind !== "free") {
      page.scene = emptyScene(page.kind);
      page.scenes = {};
      page.scenes[page.kind] = page.scene;
    }
    return page;
  }

  function actor(name, init, side) {
    return {
      id: uid(),
      name: name,
      init: init,
      side: side,
      portrait: "",
      picture: "",
      weapon: "",
      damage: "",
      hp: 0,
      hpMax: 0,
      boss: false,
      statuses: [],
      actions: side === "player" ? 1 : 0,
      dead: false
    };
  }

  function emptyScene(kind) {
    if (kind === "talk") {
      return {
        npcName: "Непись",
        font: "Georgia, serif",
        background: "",
        portrait: "",
        lines: ["Первая реплика."],
        line: 0,
        items: [],
        shopOpen: false
      };
    }
    const actors = [
      actor("Player 1", 20, "player"),
      actor("Active NPC", 16, "npc"),
      actor("npc 2", 15, "npc"),
      actor("Player 2", 12, "player"),
      actor("npc 3", 10, "npc"),
      actor("npc 4", 10, "npc"),
      actor("npc 5", 10, "npc"),
      actor("player 3", 8, "player"),
      actor("player 4", 6, "player")
    ];
    return {
      background: "",
      log: "",
      activeId: actors[1].id,
      actors: actors
    };
  }

  function defaultCodex() {
    return {
      npcs: [],
      goods: [
        { id: uid(), name: "Рюкзак", price: "2 зм", note: "", image: "" },
        { id: uid(), name: "Спальник", price: "1 зм", note: "", image: "" },
        { id: uid(), name: "Одеяло", price: "5 см", note: "", image: "" },
        { id: uid(), name: "Палатка", price: "2 зм", note: "", image: "" },
        { id: uid(), name: "Рационы, день", price: "5 см", note: "", image: "" },
        { id: uid(), name: "Бурдюк", price: "2 см", note: "", image: "" },
        { id: uid(), name: "Факел", price: "1 мм", note: "", image: "" },
        { id: uid(), name: "Фонарь", price: "5 зм", note: "", image: "" },
        { id: uid(), name: "Масло, фляга", price: "1 см", note: "", image: "" },
        { id: uid(), name: "Верёвка, 15 м", price: "1 зм", note: "", image: "" },
        { id: uid(), name: "Трутница", price: "5 см", note: "", image: "" },
        { id: uid(), name: "Зелье лечения", price: "50 зм", note: "", image: "" },
        { id: uid(), name: "Кинжал", price: "2 зм", note: "", image: "" },
        { id: uid(), name: "Короткий меч", price: "10 зм", note: "", image: "" },
        { id: uid(), name: "Длинный меч", price: "15 зм", note: "", image: "" },
        { id: uid(), name: "Боевой топор", price: "10 зм", note: "", image: "" },
        { id: uid(), name: "Короткий лук", price: "25 зм", note: "", image: "" },
        { id: uid(), name: "Стрелы, 20", price: "1 зм", note: "", image: "" },
        { id: uid(), name: "Кожаный доспех", price: "10 зм", note: "", image: "" },
        { id: uid(), name: "Кольчуга", price: "75 зм", note: "", image: "" },
        { id: uid(), name: "Щит", price: "10 зм", note: "", image: "" }
      ],
      places: [],
      coins: [
        { id: uid(), name: "Медная", code: "мм", copper: 1 },
        { id: uid(), name: "Серебряная", code: "см", copper: 10 },
        { id: uid(), name: "Электрумовая", code: "эм", copper: 50 },
        { id: uid(), name: "Золотая", code: "зм", copper: 100 },
        { id: uid(), name: "Платиновая", code: "пм", copper: 1000 }
      ]
    };
  }

  function ensureCodex(project) {
    if (!project.codex) project.codex = defaultCodex();
    project.codex.npcs = project.codex.npcs || [];
    project.codex.goods = project.codex.goods || [];
    project.codex.coins = project.codex.coins || [];
    project.codex.places = project.codex.places || [];
    return project.codex;
  }

  function createProject() {
    const page = blankPage("Сцена 1");
    return {
      version: 1,
      stage: { width: STAGE.width, height: STAGE.height },
      password: null,
      pages: [page],
      activePageId: page.id,
      shownPageId: page.id,
      codex: defaultCodex()
    };
  }

  async function hashPassword(password, salt) {
    const usedSalt = salt || Array.from(crypto.getRandomValues(new Uint8Array(16)), function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
    if (crypto.subtle) {
      const data = new TextEncoder().encode(usedSalt + ":" + password);
      const buf = await crypto.subtle.digest("SHA-256", data);
      const hash = Array.from(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
      return { salt: usedSalt, hash: hash };
    }
    let h = 5381;
    const text = usedSalt + ":" + password;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
    return { salt: usedSalt, hash: String(h >>> 0) };
  }

  function exportData(project) {
    return {
      version: 1,
      stage: project.stage,
      pages: project.pages,
      activePageId: project.activePageId,
      shownPageId: project.shownPageId,
      codex: project.codex || null
    };
  }

  function applyImport(project, data) {
    if (!data || !Array.isArray(data.pages) || !data.pages.length) {
      throw new Error("В файле нет страниц");
    }
    project.stage = {
      width: Number(data.stage && data.stage.width) || STAGE.width,
      height: Number(data.stage && data.stage.height) || STAGE.height
    };
    project.pages = data.pages.map(function (page) {
      return {
        id: page.id || uid(),
        name: page.name || "Сцена",
        kind: page.kind || "free",
        editKind: page.editKind || page.kind || "free",
        html: page.html || "",
        css: page.css || "",
        paint: page.paint || "",
        paintLayers: Array.isArray(page.paintLayers) ? page.paintLayers : null,
        scene: page.scene || null,
        scenes: page.scenes || null,
        fx: page.fx || "",
        fxRate: page.fxRate,
        fxSize: page.fxSize
      };
    });
    const known = project.pages.some(function (page) { return page.id === data.activePageId; });
    project.activePageId = known ? data.activePageId : project.pages[0].id;
    const shown = project.pages.some(function (page) { return page.id === data.shownPageId; });
    project.shownPageId = shown ? data.shownPageId : project.activePageId;
    project.codex = data.codex || null;
    ensureCodex(project);
    return project;
  }

  window.ShirmoStore = {
    STAGE: STAGE,
    uid: uid,
    getProject: getProject,
    saveProject: saveProject,
    dropProject: dropProject,
    createProject: createProject,
    blankPage: blankPage,
    emptyScene: emptyScene,
    defaultCodex: defaultCodex,
    ensureCodex: ensureCodex,
    hashPassword: hashPassword,
    exportData: exportData,
    applyImport: applyImport
  };
})();
