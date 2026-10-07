(function () {
  const STATUSES = [
    ["bleed", "Кровь"],
    ["poison", "Яд"],
    ["stun", "Оглушение"],
    ["fear", "Страх"],
    ["blind", "Слепота"],
    ["prone", "Сбит"],
    ["hold", "Оковы"],
    ["focus", "Концентрация"]
  ];

  const FONTS = [
    ["Georgia", "Georgia, serif"],
    ["Palatino", "Palatino Linotype, Palatino, serif"],
    ["Constantia", "Constantia, serif"],
    ["Segoe", "Segoe UI, sans-serif"],
    ["Impact", "Impact, sans-serif"],
    ["Courier", "Courier New, monospace"],
    ["Comic Sans", "Comic Sans MS, cursive"],
    ["Segoe Script", "Segoe Script, cursive"],
    ["Brush Script", "Brush Script MT, cursive"]
  ];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function safeSrc(src) {
    if (typeof src !== "string" || !src || /["'<>\\]/.test(src)) return "";
    if (src.indexOf("data:image/") === 0) return src;
    if (/^img\/monsters\/[^/]+\.jpe?g$/i.test(src)) return src;
    return "";
  }

  function readData(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  function parseCsv(text) {
    const rows = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (line) {
      return line.trim();
    });
    if (!rows.length) return [];
    const sep = rows[0].indexOf(";") !== -1 && rows[0].indexOf(",") === -1 ? ";" : ",";
    let start = 0;
    if (/назван|name|товар|цен|price/i.test(rows[0])) start = 1;
    const items = [];
    for (let i = start; i < rows.length; i++) {
      const cols = splitRow(rows[i], sep);
      if (!cols[0] || !cols[0].trim()) continue;
      items.push({
        name: cols[0].trim(),
        price: (cols[1] || "").trim(),
        note: (cols[2] || "").trim()
      });
    }
    return items;
  }

  function splitRow(line, sep) {
    const cols = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        quoted = !quoted;
      } else if (char === sep && !quoted) {
        cols.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cols.push(current);
    return cols;
  }

  function ensureTalk(scene) {
    scene.npcName = scene.npcName || "Непись";
    scene.font = scene.font || FONTS[0][1];
    scene.lines = scene.lines && scene.lines.length ? scene.lines : ["..."];
    scene.line = Math.min(scene.line || 0, scene.lines.length - 1);
    scene.items = scene.items || [];
    scene.shopOpen = Boolean(scene.shopOpen);
    scene.backgroundScale = scaleOf(scene.backgroundScale);
  }

  function advanceTalk(scene) {
    ensureTalk(scene);
    scene.line = (scene.line + 1) % scene.lines.length;
  }

  function newActor(name, init, side) {
    const id = window.ShirmoStore && ShirmoStore.uid ? ShirmoStore.uid() : String(Date.now());
    return {
      id: id,
      name: name || "Новый",
      init: Number(init) || 0,
      side: side || "player",
      portrait: "",
      picture: "",
      weapon: "",
      damage: "",
      hp: 0,
      hpMax: 0,
      boss: false,
      statuses: [],
      actions: side === "npc" ? 0 : 1,
      dead: false
    };
  }

  function ensureInit(scene) {
    if (!scene.actors) {
      const actors = [];
      (scene.players || []).forEach(function (person, index) {
        actors.push({
          id: person.id || newActor().id,
          name: person.name || "Игрок",
          init: 20 - index,
          side: "player",
          portrait: person.portrait || "",
          picture: "",
          statuses: [],
          actions: 1,
          dead: false
        });
      });
      (scene.npcs || []).forEach(function (person, index) {
        actors.push({
          id: person.id || newActor().id,
          name: person.name || "Непись",
          init: 10 - index,
          side: "npc",
          portrait: person.portrait || "",
          picture: "",
          statuses: [],
          actions: 0,
          dead: false
        });
      });
      scene.actors = actors;
      scene.background = scene.background || "";
      scene.log = scene.log || "";
      const old = scene.active || {};
      const pool = old.side === "npcs" ? (scene.npcs || []) : (scene.players || []);
      const picked = pool[old.index || 0];
      scene.activeId = picked && picked.id ? picked.id : (actors[0] && actors[0].id);
    }
    scene.actors = scene.actors || [];
    scene.background = scene.background || "";
    scene.log = scene.log || "";
    scene.backgroundScale = scaleOf(scene.backgroundScale);
    scene.dieMs = Math.min(6000, Math.max(400, Number(scene.dieMs) || 2300));
    scene.logRolls = Boolean(scene.logRolls);
    scene.autoSort = Boolean(scene.autoSort);
    scene.actors.forEach(function (person) {
      if (!person.id) person.id = newActor().id;
      person.init = Number(person.init) || 0;
      person.name = person.name || "";
      person.portrait = person.portrait || "";
      person.picture = person.picture || "";
      if (person.side !== "player" && person.side !== "npc") {
        person.side = /npc|непись|нпс/i.test(person.name) ? "npc" : "player";
      }
      if (!Array.isArray(person.statuses)) person.statuses = [];
      person.statuses = person.statuses.filter(function (id) {
        return STATUSES.some(function (status) { return status[0] === id; });
      });
      if (person.actions == null || person.actions === "") person.actions = person.side === "player" ? 1 : 0;
      person.actions = Math.max(0, Math.min(3, Number(person.actions) || 0));
      person.dead = Boolean(person.dead);
      if (person.weapon == null) person.weapon = "";
      if (person.damage == null) person.damage = "";
      person.hp = Math.max(0, Number(person.hp) || 0);
      person.hpMax = Math.max(0, Number(person.hpMax) || 0);
      person.boss = Boolean(person.boss);
    });
    if (!scene.actors.some(function (person) { return person.id === scene.activeId; })) {
      scene.activeId = scene.actors[0] ? scene.actors[0].id : "";
    }
    ensureLayout(scene);
  }

  function ordered(scene) {
    return scene.actors.map(function (person, index) {
      return { person: person, index: index };
    }).sort(function (a, b) {
      return (b.person.init - a.person.init) || (a.index - b.index);
    }).map(function (item) { return item.person; });
  }

  function ensureLayout(scene) {
    const known = {};
    (scene.actors || []).forEach(function (person) { known[person.id] = true; });
    if (!Array.isArray(scene.layout)) scene.layout = [];
    scene.layout = scene.layout.filter(function (row) {
      if (!row || !row.id) return false;
      if (row.kind === "sep") {
        row.text = row.text || "";
        return true;
      }
      row.kind = "actor";
      return Boolean(known[row.id]);
    });
    const placed = {};
    scene.layout.forEach(function (row) {
      if (row.kind !== "sep") placed[row.id] = true;
    });
    (scene.actors || []).forEach(function (person) {
      if (!placed[person.id]) scene.layout.push({ kind: "actor", id: person.id });
    });
  }

  function sortLayout(scene) {
    ensureLayout(scene);
    if (!scene.autoSort) return false;
    const byId = {};
    scene.actors.forEach(function (person, index) {
      byId[person.id] = { init: Number(person.init) || 0, index: index };
    });
    const next = [];
    let chunk = [];
    function flush() {
      chunk.sort(function (a, b) {
        const pa = byId[a.id];
        const pb = byId[b.id];
        return (pb.init - pa.init) || (pa.index - pb.index);
      });
      chunk.forEach(function (row) { next.push(row); });
      chunk = [];
    }
    scene.layout.forEach(function (row) {
      if (row.kind === "sep") {
        flush();
        next.push(row);
      } else chunk.push(row);
    });
    flush();
    let moved = next.length !== scene.layout.length;
    for (let i = 0; i < next.length && !moved; i++) {
      if (next[i] !== scene.layout[i]) moved = true;
    }
    if (moved) scene.layout = next;
    return moved;
  }

  function placeLayout(scene, from, to) {
    ensureLayout(scene);
    if (from === to || from < 0 || to < 0 || from >= scene.layout.length || to >= scene.layout.length) return false;
    const row = scene.layout[from];
    const dest = from < to ? to - 1 : to;
    scene.layout.splice(from, 1);
    scene.layout.splice(dest, 0, row);
    scene.autoSort = false;
    return true;
  }

  function groupsOf(list) {
    const groups = [];
    list.forEach(function (person) {
      const last = groups[groups.length - 1];
      if (last && last.init === person.init) last.actors.push(person);
      else groups.push({ init: person.init, actors: [person] });
    });
    return groups;
  }

  function advanceInit(scene) {
    ensureInit(scene);
    const all = ordered(scene);
    if (!all.some(function (person) { return !person.dead; })) return;
    const at = all.findIndex(function (person) { return person.id === scene.activeId; });
    for (let step = 1; step <= all.length; step++) {
      const person = all[(at + step) % all.length];
      if (!person.dead) {
        scene.activeId = person.id;
        return;
      }
    }
  }

  function icon(name) {
    const paths = {
      image: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="M21 16l-5-4-3 3-2-2-8 6" fill="none" stroke="currentColor" stroke-width="2"/>',
      portrait: '<circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 19c1.2-3 3.4-4.5 6-4.5S16.8 16 18 19" fill="none" stroke="currentColor" stroke-width="2"/>',
      shot: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>',
      csv: '<path d="M7 3h7l5 5v13H7z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 3v5h5M9 13h8M9 17h6" fill="none" stroke="currentColor" stroke-width="2"/>',
      player: '<path d="M12 2.2l7.2 2.6v6.2c0 4.6-3.1 8-7.2 9.8-4.1-1.8-7.2-5.2-7.2-9.8V4.8L12 2.2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.2v7.2M9.2 9.6h5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      npc: '<path d="M12 3.2a6.2 6.2 0 00-6.2 6.2c0 2.2 1.1 3.8 2.2 4.9V18h2.2v2.2h1.6V18h.4v2.2H14V18h2.2v-3.7c1.1-1.1 2.2-2.7 2.2-4.9A6.2 6.2 0 0012 3.2z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9.4" cy="9.6" r="1.15" fill="currentColor"/><circle cx="14.6" cy="9.6" r="1.15" fill="currentColor"/><path d="M10.2 13.5c.5.7 1.1 1 1.8 1s1.3-.3 1.8-1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      die: '<path d="M12 3l8 4.8v8.4L12 21l-8-4.8V7.8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v18M4 7.8l16 8.4M20 7.8L4 16.2" fill="none" stroke="currentColor" stroke-width="1.2"/>',
      bleed: '<path d="M12 3s6 6.2 6 10a6 6 0 11-12 0c0-3.8 6-10 6-10z" fill="currentColor"/>',
      poison: '<circle cx="12" cy="13" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7V3M9 5h6" fill="none" stroke="currentColor" stroke-width="2"/>',
      stun: '<path d="M12 3l1.8 5.2H19l-4.2 3.2 1.6 5.2L12 13.6 7.6 16.6l1.6-5.2L5 8.2h5.2z" fill="currentColor"/>',
      fear: '<path d="M12 4l8 14H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4M12 16h.01" stroke="currentColor" stroke-width="2"/>',
      blind: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 19L19 5" stroke="currentColor" stroke-width="2"/>',
      eye: '<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
      screen: '<rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 17v4" fill="none" stroke="currentColor" stroke-width="2"/>',
      prone: '<path d="M6 8h12M8 12h8M10 16h4" fill="none" stroke="currentColor" stroke-width="2"/>',
      hold: '<circle cx="8" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
      focus: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + "</svg>";
  }

  function fileBtn(attr, glyph, title, filled, accept, clearKey) {
    const clear = filled && clearKey
      ? '<button type="button" class="file-clear" data-clear="' + esc(clearKey) + '" title="Убрать">×</button>'
      : "";
    return '<span class="file-pair"><label class="file-btn' + (filled ? " is-set" : "") + '" title="' + esc(title) + '">' +
      icon(glyph) +
      '<input ' + attr + ' type="file" accept="' + accept + '" aria-label="' + esc(title) + '"></label>' + clear + "</span>";
  }

  function scaleOf(value) {
    const n = Number(value);
    if (!n) return 100;
    return Math.min(200, Math.max(20, Math.round(n)));
  }

  function bgAttr(scene) {
    const src = safeSrc(scene.background);
    if (!src) return "";
    return ' style="background-image:url(' + src + ');background-size:' + scaleOf(scene.backgroundScale) + '% auto;background-position:center;background-repeat:no-repeat"';
  }

  function portraitHtml(src, letter) {
    const image = safeSrc(src);
    if (image) return '<img class="face" alt="" src="' + esc(image) + '">';
    return '<div class="face face-empty">' + esc((letter || "?").slice(0, 1)) + "</div>";
  }

  function visibleItems(scene) {
    return (scene.items || []).filter(function (item) { return (item.name || "").trim(); });
  }

  function blankNpc(name) {
    return {
      id: freshId(),
      name: name || "Непись",
      ownName: true,
      peaceful: true,
      portrait: "",
      picture: "",
      font: FONTS[0][1],
      lines: ["..."],
      line: 0,
      goods: [],
      shopOpen: false,
      loot: [],
      party: [],
      hp: 0,
      hpMax: 0,
      weapon: "",
      damage: ""
    };
  }

  function blankPlace(name, parentId) {
    return { id: freshId(), name: name || "Место", parentId: parentId || "", background: "", backgroundScale: 100, hidden: false, npcs: [] };
  }

  function worldPlaces() {
    catalog.places = catalog.places || [];
    return catalog.places;
  }

  function placeById(id) {
    return worldPlaces().find(function (place) { return place.id === id; }) || null;
  }

  function childrenOf(parentId) {
    const id = parentId || "";
    return worldPlaces().filter(function (place) { return (place.parentId || "") === id; });
  }

  function visibleChildren(parentId) {
    return childrenOf(parentId).filter(function (place) { return !place.hidden; });
  }

  function placeCrumbs(place) {
    const list = [];
    let cursor = place;
    let guard = 0;
    while (cursor && guard < 24) {
      list.unshift(cursor);
      cursor = cursor.parentId ? placeById(cursor.parentId) : null;
      guard += 1;
    }
    return list;
  }

  function ensurePlaces(scene) {
    ensureTalk(scene);
    const places = worldPlaces();
    if (!places.length && scene.locations && scene.locations.length) {
      scene.locations.forEach(function (place) {
        places.push({
          id: place.id || freshId(),
          name: place.name || "Место",
          parentId: "",
          background: place.background || "",
          backgroundScale: place.backgroundScale || 100,
          hidden: Boolean(place.hidden),
          npcs: place.npcs || []
        });
      });
    }
    if (!places.length) {
      const npc = blankNpc(scene.npcName || "Непись");
      npc.portrait = scene.portrait || "";
      npc.font = scene.font || npc.font;
      npc.lines = scene.lines && scene.lines.length ? scene.lines.slice() : ["..."];
      npc.line = scene.line || 0;
      npc.goods = (scene.items || []).slice();
      npc.shopOpen = Boolean(scene.shopOpen);
      const place = blankPlace("Место", "");
      place.background = scene.background || "";
      place.backgroundScale = scene.backgroundScale || 100;
      place.npcs = [npc];
      places.push(place);
      scene.locationId = place.id;
      scene.npcId = npc.id;
    }
    if (!placeById(scene.locationId)) {
      const roots = childrenOf("");
      scene.locationId = (roots[0] || places[0]).id;
    }
    return scene;
  }

  function placeOf(scene) {
    ensurePlaces(scene);
    return placeById(scene.locationId) || worldPlaces()[0];
  }

  function npcOf(scene, id) {
    const places = worldPlaces();
    for (let i = 0; i < places.length; i++) {
      const found = (places[i].npcs || []).find(function (npc) { return npc.id === id; });
      if (found) return found;
    }
    return null;
  }

  function selectedNpc(scene) {
    const place = placeOf(scene);
    return (place.npcs || []).find(function (npc) { return npc.id === scene.npcId; }) || place.npcs[0] || null;
  }

  function npcActor(npc) {
    const person = newActor(npc.name || "Непись", 10, "npc");
    person.portrait = npc.portrait || "";
    person.picture = npc.picture || "";
    person.weapon = npc.weapon || "";
    person.damage = npc.damage || "";
    person.hp = Number(npc.hp) || 0;
    person.hpMax = Number(npc.hpMax) || Number(npc.hp) || 0;
    person.origin = npc.origin || "";
    return person;
  }

  function cloneActor(person) {
    const next = newActor(person.name || "Непись", person.init || 0, person.side === "player" ? "player" : "npc");
    next.portrait = person.portrait || "";
    next.picture = person.picture || "";
    next.weapon = person.weapon || "";
    next.damage = person.damage || "";
    next.hp = Number(person.hp) || 0;
    next.hpMax = Number(person.hpMax) || 0;
    next.boss = Boolean(person.boss);
    next.origin = person.origin || "";
    return next;
  }

  function makeFight(scene, npc) {
    const place = placeOf(scene);
    const source = npc.party && npc.party.length ? npc.party : [npcActor(npc)];
    const actors = source.map(cloneActor);
    return {
      actors: actors,
      activeId: actors[0] ? actors[0].id : "",
      log: "",
      background: place.background || "",
      backgroundScale: place.backgroundScale || 100,
      dieMs: scene.dieMs || 2300,
      logRolls: false
    };
  }

  function shopList(items) {
    return "<ul>" + items.map(function (item) {
      const image = safeSrc(item.image);
      return "<li>" + (image ? '<img class="shop-img" alt="" src="' + image + '">' : "") +
        "<span>" + esc(item.name) + "</span><b>" + esc(item.price || "") + "</b>" +
        (item.note ? "<small>" + esc(item.note) + "</small>" : "") + "</li>";
    }).join("") + "</ul>";
  }

  function npcState(scene, npc) {
    const bag = scene.seen && scene.seen[npc.id];
    return {
      line: bag && bag.line != null ? bag.line : (npc.line || 0),
      shopOpen: bag && bag.shopOpen != null ? bag.shopOpen : Boolean(npc.shopOpen)
    };
  }

  function rememberSeen(scene, npc, patch) {
    const prev = npcState(scene, npc);
    scene.seen = scene.seen || {};
    scene.seen[npc.id] = {
      line: patch.line != null ? patch.line : prev.line,
      shopOpen: patch.shopOpen != null ? patch.shopOpen : prev.shopOpen
    };
  }

  function mapButton(place) {
    return '<button type="button" class="place-map" data-map="' + esc(place.id) + '"><b>Карта</b><span>' + esc(place.name || "Место") + "</span></button>";
  }

  function renderTalk(page) {
    const scene = page.scene;
    ensurePlaces(scene);
    const place = placeOf(scene);
    const open = npcOf(scene, scene.openId);
    const lootNpc = npcOf(scene, scene.lootId);
    const parent = place.parentId ? placeById(place.parentId) : null;
    const back = parent
      ? '<button type="button" class="place-map" data-map="' + esc(parent.id) + '"><b>Назад</b><span>' + esc(parent.name || "Место") + "</span></button>"
      : "";
    const maps = visibleChildren(place.id).map(mapButton).join("");
    const showingPlace = scene.present === "place";
    const cast = showingPlace ? "" : (place.npcs || []).map(function (npc) {
      return '<button type="button" class="place-token' + (npc.peaceful ? " peaceful" : " hostile") + '" data-npc="' + esc(npc.id) + '">' +
        portraitHtml(npc.portrait || npc.picture, npc.name) +
        "<span>" + esc(npc.name || "Непись") + "</span></button>";
    }).join("");
    let extra = "";
    const loot = showingPlace ? [] : (lootNpc ? (lootNpc.loot || []).filter(function (item) { return (item.name || "").trim(); }) : []);
    if (showingPlace) {
      extra = '<div class="place-card ff-frame"><h2>' + esc(place.name || "Место") + "</h2></div>";
    } else if (loot.length) {
      extra = '<aside class="shop ff-frame"><h2>Добыча</h2>' + shopList(loot) +
        '<button type="button" data-act="loot-close">Закрыть</button></aside>';
    } else if (open && open.peaceful) {
      const lines = open.lines && open.lines.length ? open.lines : ["..."];
      const state = npcState(scene, open);
      const line = lines[Math.min(state.line, lines.length - 1)] || "";
      const items = (open.goods || []).filter(function (item) { return (item.name || "").trim(); });
      const shop = state.shopOpen && items.length
        ? '<aside class="shop ff-frame"><h2>Товары</h2>' + coinLine() + shopList(items) + "</aside>"
        : "";
      const shopButton = items.length
        ? '<button type="button" data-act="shop">' + (state.shopOpen ? "Закрыть торговлю" : "Торговля") + "</button>"
        : "";
      extra = shop + '<div class="talk-box ff-frame"><div class="talk-name" style="font-family:' + esc(open.font || FONTS[0][1]) + '">' +
        esc(open.name || "Непись") + "</div><p>" + esc(line) + '</p><div class="talk-actions"><button type="button" data-act="talk">Говорить</button>' +
        shopButton + "</div></div>";
    }
    return '<div class="place-screen"' + bgAttr(place) + '><div class="place-cast">' + back + maps + cast + "</div>" + extra + "</div>";
  }

  function statusIcons(person) {
    return (person.statuses || []).map(function (id) {
      for (let i = 0; i < STATUSES.length; i++) {
        if (STATUSES[i][0] === id) {
          return '<span class="battle-status" title="' + esc(STATUSES[i][1]) + '">' + icon(id) + "</span>";
        }
      }
      return "";
    }).join("");
  }

  function actionPips(count) {
    let html = "";
    for (let i = 0; i < count; i++) html += '<i class="battle-pip"></i>';
    return html;
  }

  function gearHtml(person) {
    if (person.side !== "npc") return "";
    const parts = [person.weapon, person.damage].filter(function (part) { return part && String(part).trim(); });
    if (!parts.length) return "";
    return '<small class="token-gear">' + esc(parts.join(" · ")) + "</small>";
  }

  function battlePortrait(person) {
    const image = safeSrc(person.portrait);
    if (image) return '<img class="face" alt="" src="' + esc(image) + '">';
    const side = person.side === "npc" ? "npc" : "player";
    return '<div class="face face-empty face-icon">' + icon(side) + "</div>";
  }

  function tokenHtml(person, active) {
    const side = person.side === "npc" ? "npc" : "player";
    const actions = side === "player" ? actionPips(person.actions || 0) : "";
    const beast = side === "npc" ? beastAttr(person.origin || person.name) : "";
    return '<button type="button" class="battle-token ' + side + (active ? " active" : "") + (person.dead ? " dead" : "") + '" data-actor-id="' + esc(person.id) + '"' + beast + '>' +
      '<span class="battle-face">' + battlePortrait(person) +
      '<span class="battle-mark ' + side + '" title="' + (side === "npc" ? "Непись" : "Игрок") + '">' + icon(side) + "</span></span>" +
      (actions ? '<span class="battle-actions">' + actions + "</span>" : "") +
      '<span class="token-name">' + esc(person.name || "—") + "</span>" +
      gearHtml(person) +
      '<span class="battle-statuses">' + statusIcons(person) + "</span></button>";
  }

  function turnBanner(person) {
    const face = person ? (safeSrc(person.portrait) || safeSrc(person.picture)) : "";
    const side = person && person.side === "npc" ? "npc" : "player";
    const inner = face
      ? '<img class="turn-face" alt="" src="' + face + '">'
      : '<div class="turn-face turn-letter ' + side + '">' + (person ? icon(side) : "") + "</div>";
    return '<div class="turn-banner">' + inner + '<img class="turn-frame" alt="" src="img/banner.png?v=3"></div>';
  }

  function renderInit(page, endFight) {
    const scene = page.scene;
    ensureInit(scene);
    const track = groupsOf(ordered(scene)).map(function (group) {
      const tokens = group.actors.map(function (person) {
        return tokenHtml(person, person.id === scene.activeId);
      }).join("");
      if (group.actors.length === 1) {
        return '<div class="battle-slot"><div class="battle-num">' + esc(group.init) + "</div>" + tokens + "</div>";
      }
      return '<div class="battle-slot battle-tie"><div class="battle-num">' + esc(group.init) +
        '</div><div class="battle-bracket">' + tokens + "</div></div>";
    }).join("");
    const active = scene.actors.find(function (person) { return person.id === scene.activeId; });
    const picture = turnBanner(active);
    return '<div class="battle"><div class="battle-track">' + track + "</div>" +
      bossBars(scene) +
      '<div class="battle-mid"' + bgAttr(scene) + "></div>" +
      '<div class="battle-panels"><div class="battle-panel battle-picture ff-frame">' + picture + "</div>" +
      '<div class="battle-panel battle-log ff-frame"><div class="log-text">' + esc(scene.log || "") + "</div>" +
      (endFight ? '<button type="button" data-act="end">Завершить бой</button>' : "") + "</div></div></div>";
  }

  function bossBars(scene) {
    const bosses = ordered(scene).filter(function (person) {
      return person.side === "npc" && person.boss && Number(person.hpMax) > 0 && !person.dead;
    });
    if (!bosses.length) return "";
    return '<div class="boss-row">' + bosses.map(function (person) {
      const max = Number(person.hpMax) || 1;
      const hp = Math.max(0, Math.min(max, Number(person.hp) || 0));
      const pct = Math.round(hp / max * 100);
      const tone = pct > 50 ? "high" : pct > 25 ? "mid" : "low";
      return '<div class="boss-unit"><div class="boss-name">' + esc(person.name || "—") +
        '</div><div class="boss-bar ff-frame"><span class="boss-track"><i class="' + tone + '" style="width:' + pct + '%"></i></span></div></div>';
    }).join("") + "</div>";
  }

  function rollFormula(text) {
    const src = String(text || "").replace(/\s+/g, "").replace(/[−–—]/g, "-");
    if (!src) return null;
    const re = /([+-]?)(\d*)([dдДкКkr])(\d*)|([+-]?\d+)/g;
    const dice = [];
    let bonus = 0;
    let saw = false;
    let match;
    while ((match = re.exec(src))) {
      saw = true;
      if (match[3]) {
        const sign = match[1] === "-" ? -1 : 1;
        const count = Math.min(12, Math.max(1, Number(match[2] || "1")));
        const sides = Math.min(100, Math.max(2, Number(match[4] || "6")));
        for (let i = 0; i < count; i++) {
          dice.push({ sides: sides, value: 1 + Math.floor(Math.random() * sides), sign: sign });
        }
      } else {
        bonus += Number(match[5]);
      }
    }
    if (!saw) return null;
    let total = bonus;
    dice.forEach(function (die) { total += die.sign * die.value; });
    return { total: total, dice: dice, bonus: bonus };
  }

  function renderPlay(root, page, act) {
    const showingPlace = page.kind === "talk" && page.scene && page.scene.present === "place";
    const fighting = !showingPlace && page.kind !== "initiative" && page.scene && page.scene.fight && page.scene.fight.actors;
    root.innerHTML = page.kind === "initiative" || fighting
      ? renderInit(fighting ? { scene: page.scene.fight } : page, Boolean(fighting))
      : renderTalk(page);
    root.onclick = function (event) {
      const button = event.target.closest("[data-act], [data-npc], [data-map], .battle-token");
      if (!button) return;
      act(function (current) {
        if (!current.scene) return;
        if (fighting || current.kind === "initiative") {
          const battle = current.kind === "initiative" ? current.scene : current.scene.fight;
          if (button.getAttribute("data-act") === "end" && current.scene.fight) {
            current.scene.lootId = current.scene.fightNpcId || "";
            current.scene.openId = current.scene.fightNpcId || "";
            current.scene.fight = null;
            current.scene.fightNpcId = "";
          }
          if (button.classList.contains("battle-token") && battle) battle.activeId = button.getAttribute("data-actor-id");
          return;
        }
        ensurePlaces(current.scene);
        const mapId = button.getAttribute("data-map");
        if (mapId && placeById(mapId)) {
          current.scene.locationId = mapId;
          current.scene.openId = "";
          current.scene.lootId = "";
          current.scene.npcId = "";
          return;
        }
        if (button.getAttribute("data-act") === "talk") {
          const npc = npcOf(current.scene, current.scene.openId);
          if (!npc) return;
          npc.lines = npc.lines && npc.lines.length ? npc.lines : ["..."];
          const state = npcState(current.scene, npc);
          rememberSeen(current.scene, npc, { line: (state.line + 1) % npc.lines.length });
        }
        if (button.getAttribute("data-act") === "shop") {
          const npc = npcOf(current.scene, current.scene.openId);
          if (!npc) return;
          rememberSeen(current.scene, npc, { shopOpen: !npcState(current.scene, npc).shopOpen });
        }
        if (button.getAttribute("data-act") === "loot-close") current.scene.lootId = "";
        const npcId = button.getAttribute("data-npc");
        if (!npcId) return;
        const npc = npcOf(current.scene, npcId);
        if (!npc) return;
        if (npc.peaceful) {
          current.scene.openId = npc.id;
          current.scene.lootId = "";
          return;
        }
        current.scene.fightNpcId = npc.id;
        current.scene.fight = makeFight(current.scene, npc);
        current.scene.openId = "";
        current.scene.lootId = "";
      });
    };
  }

  function field(label, control) {
    return '<div class="scene-field"><span>' + label + "</span>" + control + "</div>";
  }

  let catalog = { npcs: [], goods: [], coins: [] };
  let pageNow = function () { return null; };
  let publishNow = function () {};

  function setContext(opts) {
    opts = opts || {};
    if (opts.catalog) catalog = opts.catalog() || catalog;
    if (opts.page) pageNow = opts.page;
    if (opts.publish) publishNow = opts.publish;
  }

  function editKindOf(page) {
    return page.editKind || page.kind || "free";
  }

  function stash(page, kind) {
    page.scenes = page.scenes || {};
    if (!page.scenes[kind]) {
      page.scenes[kind] = ((page.kind || "free") === kind && page.scene) ? page.scene : (window.ShirmoStore ? ShirmoStore.emptyScene(kind) : {});
    }
    if ((page.kind || "free") === kind) page.scene = page.scenes[kind];
    return page.scenes[kind];
  }

  function draftScene(page) {
    const kind = editKindOf(page);
    if (kind === "free") return null;
    return stash(page, kind);
  }

  function coinLine() {
    const list = (catalog.coins || []).filter(function (coin) { return Number(coin.copper) > 0; })
      .slice().sort(function (a, b) { return Number(b.copper) - Number(a.copper); });
    if (list.length < 2) return "";
    const top = Number(list[0].copper);
    return '<p class="coin-line">' + list.map(function (coin) {
      const ratio = top / Number(coin.copper);
      const text = Math.abs(ratio - Math.round(ratio)) < 0.001 ? String(Math.round(ratio)) : String(Math.round(ratio * 100) / 100);
      return text + " " + esc(coin.code || coin.name);
    }).join(" = ") + "</p>";
  }

  function mount(root, page, onChange) {
    const kind = editKindOf(page);
    if (kind === "initiative") mountInit(root, page, onChange);
    else if (kind === "talk") mountTalk(root, page, onChange);
  }

  function goodsRows(items) {
    return items.map(function (item, index) {
      return '<div class="goods-row">' +
        '<input data-item="name" data-i="' + index + '" value="' + esc(item.name) + '" placeholder="Название">' +
        '<input data-item="price" data-i="' + index + '" value="' + esc(item.price) + '" placeholder="Цена">' +
        '<input data-item="note" data-i="' + index + '" value="' + esc(item.note) + '" placeholder="Заметка">' +
        '<button type="button" class="danger" data-item-del="' + index + '">×</button></div>';
    }).join("");
  }

  function npcOptions(placeholder) {
    const npcs = (catalog.npcs || []).filter(function (npc) { return (npc.name || "").trim(); });
    if (!npcs.length) return "";
    return '<option value="">' + placeholder + "</option>" + npcs.map(function (npc) {
      return '<option value="' + esc(npc.id) + '">' + esc(npc.name) + "</option>";
    }).join("");
  }

  let nameList = "human:casual";
  let ownName = true;
  let shopRare = {};
  let shopMin = "";
  let shopMax = "";
  let codexPane = "npcs";
  let placeFocus = "";

  function generateName(listId) {
    const lib = window.ShirmoNames;
    if (!lib || !lib.groups || !lib.groups.length) return "Безымянный";
    const parts = String(listId || nameList).split(":");
    let found = null;
    lib.groups.forEach(function (group) {
      if (group.id !== parts[0]) return;
      (group.lists || []).forEach(function (list) {
        if (list.id === parts[1]) found = list;
      });
    });
    if (!found) found = lib.groups[0].lists[0];
    const pool = Math.random() < 0.5 && found.female && found.female.length ? found.female : found.male;
    const first = pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : "Безымянный";
    const sur = found.surname && found.surname.length && Math.random() < 0.45
      ? " " + found.surname[Math.floor(Math.random() * found.surname.length)]
      : "";
    return first + sur;
  }

  function chosenName(typed) {
    if (ownName) return String(typed || "").trim() || "Непись";
    return generateName(nameList);
  }

  function nameChips() {
    const lib = window.ShirmoNames;
    if (!lib) return "";
    return '<div class="chip-row">' + lib.groups.map(function (group) {
      return (group.lists || []).map(function (list) {
        const id = group.id + ":" + list.id;
        return '<button type="button" class="chip-btn' + (id === nameList ? " is-on" : "") + '" data-name-list="' + esc(id) + '">' + esc(list.title) + "</button>";
      }).join("");
    }).join("") + "</div>";
  }

  function rarityChips() {
    const table = (window.ShirmoRu && ShirmoRu.rarity) || {};
    return Object.keys(table).map(function (id) {
      return '<button type="button" class="chip-btn' + (shopRare[id] ? " is-on" : "") + '" data-rare="' + id + '">' + esc(table[id].ru) + "</button>";
    }).join("");
  }

  function rollBox(target) {
    return '<div class="roll-box"><div class="chip-row">' + rarityChips() + "</div>" +
      '<label>от <input class="num" data-price-min type="number" min="0" value="' + esc(shopMin) + '" aria-label="Цена от, зм"></label>' +
      '<label>до <input class="num" data-price-max type="number" min="0" value="' + esc(shopMax) + '" aria-label="Цена до, зм"></label>' +
      '<button type="button" data-roll="' + esc(target) + '">Случайный</button><span data-roll-msg></span></div>';
  }

  function rollOne() {
    const pool = window.ShirmoShop || [];
    const picked = Object.keys(shopRare).filter(function (id) { return shopRare[id]; });
    const min = shopMin === "" ? null : Number(shopMin);
    const max = shopMax === "" ? null : Number(shopMax);
    const hits = pool.filter(function (row) {
      if (!shopRuName(row)) return false;
      if (picked.length && picked.indexOf(String(row[2])) < 0) return false;
      const lo = Number(row[3]) || 0;
      const hi = Number(row[4]) || lo;
      if (min == null && max == null) return true;
      if (!(lo || hi)) return false;
      return lo <= (max == null ? Infinity : max) && hi >= (min == null ? 0 : min);
    });
    if (!hits.length) return null;
    const row = hits[Math.floor(Math.random() * hits.length)];
    const table = (window.ShirmoRu && ShirmoRu.rarity) || {};
    const rare = table[String(row[2])];
    const lo = Number(row[3]) || 0;
    const hi = Number(row[4]) || lo;
    const price = lo || hi ? (lo === hi ? Math.round(lo) + " зм" : Math.round(lo) + "–" + Math.round(hi) + " зм") : "";
    return { name: shopRuName(row), price: price, note: rare ? rare.ru : "", image: "" };
  }

  function shopRuName(row) {
    const first = String(row[0] || "");
    if (/[а-яё]/i.test(first)) return first;
    return ruOf("items", row[1] || "") || ruOf("items", first) || "";
  }

  function bindRoll(root, onHit) {
    root.querySelectorAll("[data-rare]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-rare");
        shopRare[id] = !shopRare[id];
        button.classList.toggle("is-on", Boolean(shopRare[id]));
      });
    });
    const min = root.querySelector("[data-price-min]");
    const max = root.querySelector("[data-price-max]");
    if (min) min.addEventListener("input", function () { shopMin = min.value; });
    if (max) max.addEventListener("input", function () { shopMax = max.value; });
    root.querySelectorAll("[data-roll]").forEach(function (button) {
      button.addEventListener("click", function () {
        const item = rollOne();
        const msg = button.parentNode.querySelector("[data-roll-msg]");
        if (!item) {
          if (msg) msg.textContent = "Пусто по этому фильтру";
          return;
        }
        if (msg) msg.textContent = "";
        onHit(item, button.getAttribute("data-roll"));
      });
    });
    root.querySelectorAll("[data-name-list]").forEach(function (button) {
      button.addEventListener("click", function () {
        nameList = button.getAttribute("data-name-list");
        root.querySelectorAll("[data-name-list]").forEach(function (chip) {
          chip.classList.toggle("is-on", chip.getAttribute("data-name-list") === nameList);
        });
      });
    });
  }

  function mountTalk(root, page, onChange) {
    const scene = draftScene(page);
    ensurePlaces(scene);
    const place = placeOf(scene);
    const npc = selectedNpc(scene);
    if (npc) scene.npcId = npc.id;
    const parent = place.parentId ? placeById(place.parentId) : null;
    const crumbs = placeCrumbs(place).map(function (item, index, list) {
      if (index === list.length - 1) return "<b>" + esc(item.name || "Место") + "</b>";
      return '<button type="button" data-map="' + esc(item.id) + '">' + esc(item.name || "Место") + "</button>";
    }).join(" / ");
    const back = parent ? '<button type="button" data-map="' + esc(parent.id) + '">Назад</button>' : "";
    const placeOn = scene.present === "place";
    const shown = '<div class="row">' +
      '<button type="button" data-present="place"' + (placeOn ? ' class="is-on"' : "") + ' title="На экране фон и название места">Локация</button>' +
      '<button type="button" data-present="cast"' + (placeOn ? "" : ' class="is-on"') + ' title="На экране персонажи этого места">НПС</button></div>';
    function placeRow(item) {
      const here = item.id === place.id ? " is-on" : "";
      const shownHere = placeOn && scene.locationId === item.id ? " is-on" : "";
      const veiled = item.hidden ? " is-hidden" : "";
      const hideTitle = item.hidden ? "Показать в списке на ширме" : "Скрыть из списка на ширме";
      return '<div class="pick-line">' +
        '<button type="button" class="pick-row' + here + veiled + '" data-map="' + esc(item.id) + '">' + esc(item.name || "Место") + "</button>" +
        '<button type="button" class="side-btn' + (item.hidden ? "" : " is-on") + '" data-hide-place="' + esc(item.id) + '" title="' + hideTitle + '" aria-label="' + hideTitle + '">' +
        icon(item.hidden ? "blind" : "eye") + "</button>" +
        '<button type="button" class="side-btn' + shownHere + '" data-show-place="' + esc(item.id) + '" title="Показать на ширме" aria-label="Показать на ширме">' +
        icon("screen") + "</button></div>";
    }
    const level = childrenOf(place.parentId || "").map(placeRow).join("");
    const below = childrenOf(place.id).map(placeRow).join("");
    const maps = '<div class="queue-label"><b>Этот уровень</b></div><div class="place-list">' + (level || '<p class="scene-note">Мест нет.</p>') + "</div>" +
      (below ? '<div class="queue-label"><b>Подлокации</b></div><div class="place-list">' + below + "</div>" : "");
    const people = (place.npcs || []).map(function (item) {
      return '<div class="pick-line"><button type="button" class="pick-row' + (npc && item.id === npc.id ? " is-on" : "") + '" data-pick-place="' + esc(item.id) + '">' +
        esc(item.name || "Непись") + (item.peaceful ? "" : " · враг") + "</button></div>";
    }).join("") || '<p class="scene-note">На этом месте никого нет.</p>';
    let detail = '<p class="scene-note">Места, персонажи и враги создаются в справочнике.</p>';
    if (placeOn) {
      const src = safeSrc(place.background);
      detail = '<div class="place-preview"><h2>' + esc(place.name || "Место") + "</h2>" +
        (src ? '<img alt="" src="' + src + '">' : '<p class="scene-note">Фон задаётся справа.</p>') + "</div>";
    } else if (npc) {
      const lines = (npc.lines || ["..."]).join("\n");
      const stock = npc.peaceful
        ? '<div class="scene-field"><span>Реплики</span><textarea data-lines rows="6">' + esc(lines) + "</textarea></div>" +
          '<div class="scene-field"><span>Товары</span>' + goodsRows(npc.goods || []) +
          '<div class="row"><button type="button" data-item-add>Добавить товар</button></div>' + rollBox("goods") + "</div>"
        : '<p class="scene-note">Клик по нему на экране открывает бой с этим составом.</p>' +
          '<div class="scene-field"><span>Участники боя</span>' + partyRows(npc) +
          '<div class="row"><button type="button" data-party-add>Добавить</button></div></div>' +
          '<div class="scene-field"><span>Добыча после боя</span>' + lootRows(npc) +
          '<div class="row"><button type="button" data-loot-add>Добавить</button></div>' + rollBox("loot") + "</div>";
      detail = '<div class="row"><input data-npc-name value="' + esc(npc.name || "") + '" aria-label="Имя">' +
        '<label class="check"><input type="checkbox" data-peaceful' + (npc.peaceful ? " checked" : "") + "> Мирный</label></div>" +
        '<div class="row">' + fileBtn('data-file="portrait"', "portrait", "Портрет", Boolean(safeSrc(npc.portrait)), "image/*", "portrait") +
        fileBtn('data-file="picture"', "shot", "Боевой облик", Boolean(safeSrc(npc.picture)), "image/*", "picture") + "</div>" +
        stock;
    }
    root.innerHTML = '<div class="scene-workspace"><div class="place-col">' +
      '<div class="row">' + back + "</div>" + shown +
      '<div class="place-crumbs">' + crumbs + "</div>" +
      maps +
      '<div class="queue-label"><b>НПС</b></div>' +
      '<div class="place-list">' + people + "</div></div>" +
      '<div class="scene-main"><div class="scene-form">' + detail + "</div></div>" +
      sidePanel(place, "talk") + "</div>";
    bindTalk(root, page, onChange);
    bindSide(root, place, onChange, function () {
      if (root.isConnected) mountTalk(root, page, onChange);
    });
  }

  function partyRows(npc) {
    return (npc.party || []).map(function (person, index) {
      const side = person.side === "player" ? "Игрок" : "Непись";
      return '<div class="goods-row"><button type="button" data-party-side data-i="' + index + '">' + side + "</button>" +
        '<input data-party="name" data-i="' + index + '" value="' + esc(person.name || "") + '" placeholder="Имя">' +
        '<input class="num" data-party="init" data-i="' + index + '" type="number" value="' + esc(person.init || 0) + '" aria-label="Инициатива">' +
        '<input class="num" data-party="hp" data-i="' + index + '" type="number" value="' + esc(person.hp || 0) + '" aria-label="ХП">' +
        '<input data-party="weapon" data-i="' + index + '" value="' + esc(person.weapon || "") + '" placeholder="Оружие">' +
        '<input data-party="damage" data-i="' + index + '" value="' + esc(person.damage || "") + '" placeholder="Урон">' +
        '<button type="button" class="danger" data-party-del="' + index + '">×</button></div>';
    }).join("");
  }

  function lootRows(npc) {
    return (npc.loot || []).map(function (item, index) {
      return '<div class="goods-row"><input data-loot="name" data-i="' + index + '" value="' + esc(item.name || "") + '" placeholder="Название">' +
        '<input data-loot="price" data-i="' + index + '" value="' + esc(item.price || "") + '" placeholder="Цена">' +
        '<input data-loot="note" data-i="' + index + '" value="' + esc(item.note || "") + '" placeholder="Заметка">' +
        '<button type="button" class="danger" data-loot-del="' + index + '">×</button></div>';
    }).join("");
  }

  function bindTalk(root, page, onChange) {
    const scene = draftScene(page);
    ensurePlaces(scene);
    function npc() { return selectedNpc(scene); }
    function place() { return placeOf(scene); }
    function again() {
      onChange();
      if (root.isConnected) mountTalk(root, page, onChange);
    }
    function showToPlayer() {
      const placeId = scene.locationId;
      const mode = scene.present === "place" ? "place" : "cast";
      if (root.isConnected) mountTalk(root, page, onChange);
      publishNow(function (live) {
        live.present = mode;
        if (placeId) live.locationId = placeId;
        live.openId = "";
        if (mode === "place") live.lootId = "";
      });
    }
    const locName = root.querySelector("[data-loc-name]");
    if (locName) locName.addEventListener("input", function () {
      place().name = locName.value;
      onChange();
    });
    const npcName = root.querySelector("[data-npc-name]");
    if (npcName) npcName.addEventListener("input", function () {
      const current = npc();
      if (current) current.name = npcName.value;
      onChange();
    });
    const lines = root.querySelector("[data-lines]");
    if (lines) lines.addEventListener("input", function () {
      const current = npc();
      if (!current) return;
      const next = lines.value.split(/\n/);
      current.lines = next.length ? next : ["..."];
      current.line = Math.min(current.line || 0, current.lines.length - 1);
      onChange();
    });
    root.querySelectorAll("[data-item]").forEach(function (input) {
      input.addEventListener("input", function () {
        const current = npc();
        const item = current && current.goods && current.goods[Number(input.getAttribute("data-i"))];
        if (item) item[input.getAttribute("data-item")] = input.value;
        onChange();
      });
    });
    root.querySelectorAll("[data-loot]").forEach(function (input) {
      input.addEventListener("input", function () {
        const current = npc();
        const item = current && current.loot && current.loot[Number(input.getAttribute("data-i"))];
        if (item) item[input.getAttribute("data-loot")] = input.value;
        onChange();
      });
    });
    root.querySelectorAll("[data-party]").forEach(function (input) {
      input.addEventListener("input", function () {
        const current = npc();
        const person = current && current.party && current.party[Number(input.getAttribute("data-i"))];
        if (!person) return;
        const key = input.getAttribute("data-party");
        person[key] = key === "init" || key === "hp" ? Number(input.value) : input.value;
        onChange();
      });
    });
    root.querySelectorAll("[data-map]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-map");
        if (!placeById(id)) return;
        scene.locationId = id;
        const next = placeOf(scene);
        scene.npcId = next.npcs[0] ? next.npcs[0].id : "";
        scene.openId = "";
        again();
      });
    });
    root.querySelectorAll("[data-pick-place]").forEach(function (button) {
      button.addEventListener("click", function () {
        scene.npcId = button.getAttribute("data-pick-place");
        again();
      });
    });
    root.querySelectorAll("[data-present]").forEach(function (button) {
      button.addEventListener("click", function () {
        scene.present = button.getAttribute("data-present") === "place" ? "place" : "cast";
        if (scene.present === "place") {
          scene.openId = "";
          scene.lootId = "";
        }
        showToPlayer();
      });
    });
    root.querySelectorAll("[data-show-place]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-show-place");
        if (!placeById(id)) return;
        scene.locationId = id;
        scene.present = "place";
        scene.openId = "";
        scene.lootId = "";
        scene.npcId = "";
        showToPlayer();
      });
    });
    root.querySelectorAll("[data-hide-place]").forEach(function (button) {
      button.addEventListener("click", function () {
        const spot = placeById(button.getAttribute("data-hide-place"));
        if (!spot) return;
        spot.hidden = !spot.hidden;
        again();
      });
    });
    const addPlace = root.querySelector("[data-loc-add]");
    if (addPlace) addPlace.addEventListener("click", function () {
      const next = blankPlace("Место " + (scene.locations.length + 1));
      scene.locations.push(next);
      scene.locationId = next.id;
      scene.npcId = "";
      again();
    });
    root.querySelectorAll("[data-loc-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-loc-del");
        scene.locations = scene.locations.filter(function (item) { return item.id !== id; });
        if (!scene.locations.length) scene.locations.push(blankPlace("Место"));
        scene.locationId = scene.locations[0].id;
        scene.npcId = scene.locations[0].npcs[0] ? scene.locations[0].npcs[0].id : "";
        again();
      });
    });
    root.querySelectorAll("[data-npc-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-npc-del");
        const here = place();
        here.npcs = (here.npcs || []).filter(function (item) { return item.id !== id; });
        scene.npcId = here.npcs[0] ? here.npcs[0].id : "";
        again();
      });
    });
    const own = root.querySelector("[data-own]");
    if (own) own.addEventListener("change", function () { ownName = own.checked; });
    const addNpc = root.querySelector("[data-place-npc]");
    if (addNpc) addNpc.addEventListener("click", function () {
      const typed = root.querySelector("[data-new-name]");
      const person = blankNpc(chosenName(typed && typed.value));
      place().npcs.push(person);
      scene.npcId = person.id;
      rememberNpc(person);
      again();
    });
    const gen = root.querySelector("[data-gen-this]");
    if (gen) gen.addEventListener("click", function () {
      const current = npc();
      if (!current) return;
      current.name = generateName(nameList);
      again();
    });
    const saveCodex = root.querySelector("[data-save-codex]");
    if (saveCodex) saveCodex.addEventListener("click", function () {
      const current = npc();
      if (current) rememberNpc(current);
    });
    const peace = root.querySelector("[data-peaceful]");
    if (peace) peace.addEventListener("change", function () {
      const current = npc();
      if (!current) return;
      current.peaceful = peace.checked;
      if (!current.peaceful && (!current.party || !current.party.length)) current.party = [npcActor(current)];
      again();
    });
    const addItem = root.querySelector("[data-item-add]");
    if (addItem) addItem.addEventListener("click", function () {
      const current = npc();
      if (!current) return;
      current.goods = current.goods || [];
      current.goods.push({ name: "", price: "", note: "", image: "" });
      current.shopOpen = true;
      again();
    });
    root.querySelectorAll("[data-item-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const current = npc();
        if (!current) return;
        current.goods.splice(Number(button.getAttribute("data-item-del")), 1);
        again();
      });
    });
    const addLoot = root.querySelector("[data-loot-add]");
    if (addLoot) addLoot.addEventListener("click", function () {
      const current = npc();
      if (!current) return;
      current.loot = current.loot || [];
      current.loot.push({ name: "", price: "", note: "", image: "" });
      again();
    });
    root.querySelectorAll("[data-loot-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const current = npc();
        if (!current) return;
        current.loot.splice(Number(button.getAttribute("data-loot-del")), 1);
        again();
      });
    });
    const addParty = root.querySelector("[data-party-add]");
    if (addParty) addParty.addEventListener("click", function () {
      const current = npc();
      if (!current) return;
      current.party = current.party || [];
      current.party.push(newActor("Новый", 10, "npc"));
      again();
    });
    root.querySelectorAll("[data-party-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const current = npc();
        if (!current) return;
        current.party.splice(Number(button.getAttribute("data-party-del")), 1);
        again();
      });
    });
    root.querySelectorAll("[data-party-side]").forEach(function (button) {
      button.addEventListener("click", function () {
        const current = npc();
        const person = current && current.party[Number(button.getAttribute("data-i"))];
        if (!person) return;
        person.side = person.side === "player" ? "npc" : "player";
        person.actions = person.side === "player" ? 1 : 0;
        again();
      });
    });
    root.querySelectorAll("[data-file]").forEach(function (input) {
      input.addEventListener("change", async function () {
        const file = input.files && input.files[0];
        const current = npc();
        if (!file || !current) return;
        current[input.getAttribute("data-file")] = await readData(file);
        again();
      });
    });
    root.querySelectorAll("[data-clear]").forEach(function (button) {
      button.addEventListener("click", function () {
        const current = npc();
        const key = button.getAttribute("data-clear");
        if (!current) return;
        if (key === "portrait") current.portrait = "";
        if (key === "picture") current.picture = "";
        again();
      });
    });
    bindRoll(root, function (item, target) {
      const current = npc();
      if (!current) return;
      const list = target === "loot" ? (current.loot = current.loot || []) : (current.goods = current.goods || []);
      list.push(item);
      if (target !== "loot") current.shopOpen = true;
      again();
    });
  }

  let publishRoll = function () {};
  let publishHit = function () {};

  function statusSelect() {
    return '<option value="">Статус</option>' + STATUSES.map(function (status) {
      return '<option value="' + status[0] + '">' + esc(status[1]) + "</option>";
    }).join("");
  }

  function statusChips(person, index) {
    return (person.statuses || []).map(function (id) {
      let name = id;
      for (let i = 0; i < STATUSES.length; i++) if (STATUSES[i][0] === id) name = STATUSES[i][1];
      return '<button type="button" class="chip" data-status-del="' + esc(id) + '" data-i="' + index + '">' + icon(id) + esc(name) + " ×</button>";
    }).join("");
  }

  function sidePanel(scene, mode) {
    const scale = scaleOf(scene.backgroundScale);
    let dice = "";
    if (mode === "initiative") {
      const sec = (Math.min(6000, Math.max(400, Number(scene.dieMs) || 2300)) / 1000).toFixed(1);
      dice = '<label class="side-field"><span>Бросок, сек</span><input type="range" min="0.4" max="6" step="0.1" data-die-sec value="' + sec + '"><b data-die-readout>' + sec + " с</b></label>" +
        '<label class="check"><input type="checkbox" data-log-rolls' + (scene.logRolls ? " checked" : "") + "> Писать броски в лог</label>";
    }
    return '<aside class="scene-side"><h2>Сцена</h2>' +
      '<div class="side-field"><span>Фон</span>' + fileBtn('data-file="background"', "image", "Фон", Boolean(safeSrc(scene.background)), "image/*", "background") + "</div>" +
      '<label class="side-field"><span>Размер фона</span><input type="range" min="20" max="200" step="5" data-bg-scale value="' + scale + '"><b data-bg-readout>' + scale + "%</b></label>" +
      dice + "</aside>";
  }

  function bindSide(root, scene, onChange, remount) {
    const scale = root.querySelector("[data-bg-scale]");
    if (scale) {
      scale.addEventListener("input", function () {
        scene.backgroundScale = scaleOf(scale.value);
        const readout = root.querySelector("[data-bg-readout]");
        if (readout) readout.textContent = scene.backgroundScale + "%";
        onChange();
      });
    }
    const die = root.querySelector("[data-die-sec]");
    if (die) {
      die.addEventListener("input", function () {
        scene.dieMs = Math.round(Number(die.value) * 1000);
        const readout = root.querySelector("[data-die-readout]");
        if (readout) readout.textContent = Number(die.value).toFixed(1) + " с";
        onChange();
      });
    }
    const logRolls = root.querySelector("[data-log-rolls]");
    if (logRolls) {
      logRolls.addEventListener("change", function () {
        scene.logRolls = logRolls.checked;
        onChange();
      });
    }
    root.querySelectorAll('[data-clear="background"]').forEach(function (button) {
      button.addEventListener("click", function () {
        scene.background = "";
        onChange();
        if (remount) remount();
      });
    });
  }

  function moveCell(at) {
    return '<td class="queue-move"><span class="drag-grip" draggable="true" data-drag data-at="' + at + '" title="Перетащить. Только в панели мастера">⋮⋮</span></td>';
  }

  function separatorRow(row, at) {
    return '<tr class="queue-sep">' + moveCell(at) +
      '<td colspan="12"><input data-sep="' + esc(row.id) + '" value="' + esc(row.text || "") + '" placeholder="Разделитель" aria-label="Разделитель"></td>' +
      '<td><button type="button" class="danger" data-sep-del="' + esc(row.id) + '" title="Убрать разделитель">×</button></td></tr>';
  }

  function actorCard(scene, person, index, at) {
    const active = person.id === scene.activeId ? " active-edit" : "";
    const side = person.side === "npc" ? "npc" : "player";
    const roll = side === "npc"
      ? '<button type="button" class="file-btn" data-roll-init data-i="' + index + '" title="Бросок инициативы">' + icon("die") + "</button>"
      : "";
    let control = "";
    if (side === "player") {
      control = '<span class="pip-edit">';
      for (let n = 1; n <= 3; n++) {
        control += '<button type="button" class="pip-btn' + (n <= person.actions ? " is-on" : "") + '" data-actions="' + n + '" data-i="' + index + '" title="Действий: ' + n + '"></button>';
      }
      control += "</span>";
    } else if (person.dead) {
      control = '<button type="button" data-revive data-i="' + index + '">Оживить</button>';
    } else {
      const options = scene.actors.filter(function (other) { return other.id !== person.id; }).map(function (other) {
        return '<option value="' + esc(other.id) + '">' + esc(other.name || "—") + "</option>";
      }).join("");
      control = '<select data-killer data-i="' + index + '" aria-label="Кто убил"><option value="">Кто</option>' + options + "</select>" +
        '<button type="button" class="danger" data-kill data-i="' + index + '">Убить</button>';
    }
    const weapon = side === "npc"
      ? '<input data-actor="weapon" data-i="' + index + '" value="' + esc(person.weapon || "") + '" placeholder="меч" aria-label="Оружие">'
      : "";
    const damage = side === "npc"
      ? '<span class="dmg-edit"><input data-actor="damage" data-i="' + index + '" value="' + esc(person.damage || "") + '" placeholder="1d8" aria-label="Урон">' +
        '<button type="button" class="file-btn" data-roll-dmg data-i="' + index + '" title="Бросок урона">' + icon("die") + "</button></span>"
      : "";
    const hp = side === "npc"
      ? '<span class="hp-edit"><input class="num" data-actor="hp" data-i="' + index + '" type="number" min="0" value="' + esc(person.hp) + '" aria-label="ХП">' +
        '<input class="num" data-actor="hpMax" data-i="' + index + '" type="number" min="0" value="' + esc(person.hpMax) + '" aria-label="Максимум ХП">' +
        '<button type="button" class="boss-btn' + (person.boss ? " is-on" : "") + '" data-boss data-i="' + index + '" title="Полоска на экране игроков">Босс</button></span>'
      : "";
    return '<tr class="' + active + (person.dead ? " is-dead" : "") + '">' +
      moveCell(at) +
      '<td><input class="num" data-actor="init" data-i="' + index + '" data-who="' + esc(person.id) + '" type="number" value="' + esc(person.init) + '" aria-label="Инициатива"></td>' +
      "<td>" + roll + "</td>" +
      '<td><div class="side-pick">' +
      '<button type="button" class="side-btn' + (side === "player" ? " is-on" : "") + '" data-side-set="player" data-i="' + index + '" title="Игрок">' + icon("player") + "</button>" +
      '<button type="button" class="side-btn' + (side === "npc" ? " is-on" : "") + '" data-side-set="npc" data-i="' + index + '" title="Непись">' + icon("npc") + "</button></div></td>" +
      '<td><input data-actor="name" data-i="' + index + '"' + (side === "npc" ? beastAttr(person.origin || person.name) : "") + ' value="' + esc(person.name) + '" aria-label="Имя"></td>' +
      "<td>" + weapon + "</td><td>" + damage + "</td><td>" + hp + "</td>" +
      "<td>" + fileBtn('data-photo="' + index + '"', "portrait", "Портрет", Boolean(safeSrc(person.portrait)), "image/*", "photo:" + index) + "</td>" +
      "<td>" + fileBtn('data-picture="' + index + '"', "shot", "Боевой облик", Boolean(safeSrc(person.picture)), "image/*", "shot:" + index) + "</td>" +
      "<td>" + control + "</td>" +
      '<td class="status-cell"><select data-status-add data-i="' + index + '" aria-label="Статус">' + statusSelect() + "</select>" +
      '<span class="chips">' + statusChips(person, index) + "</span></td>" +
      '<td><button type="button" data-pick="' + person.id + '">Ход</button></td>' +
      '<td><button type="button" class="danger" data-del="' + index + '">×</button></td></tr>';
  }

  function mountInit(root, page, onChange) {
    const scene = draftScene(page);
    ensureInit(scene);
    if (scene.autoSort) sortLayout(scene);
    const rows = scene.layout.map(function (row, at) {
      if (row.kind === "sep") return separatorRow(row, at);
      const index = scene.actors.findIndex(function (person) { return person.id === row.id; });
      if (index < 0) return "";
      return actorCard(scene, scene.actors[index], index, at);
    }).join("");
    root.innerHTML = '<div class="scene-workspace"><div class="scene-main">' +
      '<div class="queue-label">Очередь <button type="button" data-auto-sort' + (scene.autoSort ? ' class="is-on"' : "") + ' title="Новые и смена числа сами встают по убыванию">По числу</button><span class="hint" tabindex="0" aria-label="Подсказка" data-tip="Число сверху, на экране слева те, у кого оно больше. Одинаковые числа стоят под одной скобкой. Порядок строк перетаскивается и виден только мастеру.">?</span></div>' +
      '<table class="cast"><thead><tr><th></th><th>Число</th><th></th><th></th><th>Имя</th><th>Оружие</th><th>Урон</th><th>ХП</th><th></th><th></th><th></th><th>Статус</th><th></th><th></th></tr></thead><tbody>' +
      rows + "</tbody></table>" +
      '<div class="scene-field"><span class="queue-label">Лог боя <button type="button" data-clear-log>Очистить</button></span><textarea data-log rows="4">' + esc(scene.log || "") + "</textarea></div>" +
      '<div class="row"><button type="button" data-add>Добавить</button>' +
      '<button type="button" data-sep-add title="Полоса только в очереди мастера">Разделитель</button>' +
      '<button type="button" data-pick-codex>Из справочника</button>' +
      '<button type="button" data-monsters>Монстры</button>' +
      '<button type="button" class="primary" data-next>Следующий ход</button></div></div>' +
      sidePanel(scene, "initiative") + "</div>";
    bindInit(root, page, onChange);
    bindSide(root, scene, onChange, function () {
      if (root.isConnected) mountInit(root, page, onChange);
    });
  }

  function openList(title, rows, onPick) {
    const pop = document.getElementById("pop");
    if (!pop) return;
    pop.classList.remove("hidden");
    pop.innerHTML = '<div class="pop-card" role="dialog"><div class="pop-head"><h2>' + esc(title) +
      '</h2><button type="button" data-pop-close>×</button></div><input id="pick-q" placeholder="Поиск" aria-label="Поиск"><div id="pick-list"></div></div>';
    const query = pop.querySelector("#pick-q");
    function paint() {
      const q = query.value.trim().toLowerCase();
      const hits = rows.filter(function (row) {
        if (!q) return true;
        return (String(row.label) + " " + (row.q || "")).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 60);
      const list = pop.querySelector("#pick-list");
      list.innerHTML = hits.map(function (row, index) {
        return '<button type="button" class="pick-row" data-pick-i="' + index + '"' + beastAttr(row.beast || row.label) + '>' + esc(row.label) + "</button>";
      }).join("") || '<p class="scene-note">Пусто</p>';
      list.onclick = function (event) {
        const button = event.target.closest("[data-pick-i]");
        if (!button) return;
        onPick(hits[Number(button.getAttribute("data-pick-i"))]);
        pop.classList.add("hidden");
      };
    }
    query.addEventListener("input", paint);
    pop.querySelector("[data-pop-close]").addEventListener("click", function () { pop.classList.add("hidden"); });
    paint();
  }

  function bindInit(root, page, onChange) {
    const scene = draftScene(page);
    root.querySelectorAll("[data-clear]").forEach(function (button) {
      button.addEventListener("click", function () {
        const bits = button.getAttribute("data-clear").split(":");
        const person = scene.actors[Number(bits[1])];
        if (!person) return;
        if (bits[0] === "photo") person.portrait = "";
        if (bits[0] === "shot") person.picture = "";
        onChange();
        if (root.isConnected) mountInit(root, page, onChange);
      });
    });
    root.querySelectorAll("[data-actor]").forEach(function (input) {
      input.addEventListener("input", function () {
        const person = scene.actors[Number(input.getAttribute("data-i"))];
        if (!person) return;
        const key = input.getAttribute("data-actor");
        person[key] = key === "init" || key === "hp" || key === "hpMax" ? Number(input.value) : input.value;
        onChange();
        if (key === "init" && scene.autoSort && sortLayout(scene)) {
          const id = person.id;
          mountInit(root, page, onChange);
          const fields = root.querySelectorAll('[data-actor="init"]');
          for (let i = 0; i < fields.length; i++) {
            if (fields[i].getAttribute("data-who") === id) {
              fields[i].focus();
              break;
            }
          }
        }
      });
    });
    const log = root.querySelector("[data-log]");
    log.addEventListener("input", function () {
      scene.log = log.value;
      onChange();
    });
    root.querySelectorAll("[data-side-set]").forEach(function (button) {
      button.addEventListener("click", function () {
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        if (!person) return;
        commit(root, page);
        person.side = button.getAttribute("data-side-set");
        if (person.side === "npc") person.actions = 0;
        onChange();
        mountInit(root, page, onChange);
      });
    });
    root.querySelectorAll("[data-actions]").forEach(function (button) {
      button.addEventListener("click", function () {
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        if (!person) return;
        const count = Number(button.getAttribute("data-actions"));
        person.actions = person.actions === count ? count - 1 : count;
        const box = button.parentElement;
        box.querySelectorAll(".pip-btn").forEach(function (el) {
          el.classList.toggle("is-on", Number(el.getAttribute("data-actions")) <= person.actions);
        });
        onChange();
      });
    });
    root.querySelectorAll("[data-status-add]").forEach(function (select) {
      select.addEventListener("change", function () {
        const person = scene.actors[Number(select.getAttribute("data-i"))];
        if (!person || !select.value) return;
        if (person.statuses.indexOf(select.value) < 0) person.statuses.push(select.value);
        onChange();
        mountInit(root, page, onChange);
      });
    });
    root.querySelectorAll("[data-status-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        if (!person) return;
        person.statuses = person.statuses.filter(function (id) { return id !== button.getAttribute("data-status-del"); });
        onChange();
        mountInit(root, page, onChange);
      });
    });
    root.querySelectorAll("[data-kill]").forEach(function (button) {
      button.addEventListener("click", function () {
        commit(root, page);
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        const select = root.querySelector('[data-killer][data-i="' + button.getAttribute("data-i") + '"]');
        const killer = scene.actors.find(function (other) { return other.id === (select && select.value); });
        if (!person || !killer || person.dead) return;
        person.dead = true;
        person.killedBy = killer.id;
        const line = (killer.name || "Кто-то") + " убивает " + (person.name || "непись") + ".";
        scene.log = scene.log && scene.log.trim() ? scene.log.replace(/\s*$/, "") + "\n" + line : line;
        if (scene.activeId === person.id) advanceInit(scene);
        onChange();
        mountInit(root, page, onChange);
      });
    });
    root.querySelectorAll("[data-roll-init]").forEach(function (button) {
      button.addEventListener("click", function () {
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        if (!person) return;
        const result = 1 + Math.floor(Math.random() * 20);
        person.init = result;
        publishRoll(result, person.name || "Непись");
        onChange();
        if (scene.autoSort && sortLayout(scene)) {
          mountInit(root, page, onChange);
          return;
        }
        const input = button.closest("tr").querySelector("[data-actor='init']");
        if (input) input.value = String(result);
      });
    });
    root.querySelectorAll("[data-roll-dmg]").forEach(function (button) {
      button.addEventListener("click", function () {
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        if (!person) return;
        const roll = rollFormula(person.damage);
        if (!roll || !roll.dice.length) {
          button.title = "Нужна формула, например 2к6+2";
          return;
        }
        const name = person.name || "Непись";
        const weapon = person.weapon && String(person.weapon).trim();
        button.title = "Урон " + roll.total;
        publishHit(roll, weapon ? name + " · " + weapon : name);
        onChange();
      });
    });
    root.querySelectorAll("[data-boss]").forEach(function (button) {
      button.addEventListener("click", function () {
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        if (!person) return;
        person.boss = !person.boss;
        button.classList.toggle("is-on", person.boss);
        onChange();
      });
    });
    root.querySelectorAll("[data-revive]").forEach(function (button) {
      button.addEventListener("click", function () {
        const person = scene.actors[Number(button.getAttribute("data-i"))];
        if (!person) return;
        person.dead = false;
        person.killedBy = "";
        onChange();
        mountInit(root, page, onChange);
      });
    });
    const clearLog = root.querySelector("[data-clear-log]");
    if (clearLog) {
      clearLog.addEventListener("click", function () {
        scene.log = "";
        const area = root.querySelector("[data-log]");
        if (area) area.value = "";
        onChange();
      });
    }
    const background = root.querySelector("[data-file]");
    background.addEventListener("change", async function () {
      const file = background.files && background.files[0];
      if (!file) return;
      scene.background = await readData(file);
      onChange();
      if (root.isConnected) mountInit(root, page, onChange);
    });
    root.querySelectorAll("[data-photo], [data-picture]").forEach(function (input) {
      input.addEventListener("change", async function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const person = scene.actors[Number(input.getAttribute("data-photo") != null && input.hasAttribute("data-photo") ? input.getAttribute("data-photo") : input.getAttribute("data-picture"))];
        if (!person) return;
        person[input.hasAttribute("data-photo") ? "portrait" : "picture"] = await readData(file);
        onChange();
        if (root.isConnected) mountInit(root, page, onChange);
      });
    });
    root.querySelectorAll("[data-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        commit(root, page);
        scene.actors.splice(Number(button.getAttribute("data-del")), 1);
        ensureInit(scene);
        onChange();
        mountInit(root, page, onChange);
      });
    });
    const fromMonsters = root.querySelector("[data-monsters]");
    if (fromMonsters) {
      fromMonsters.addEventListener("click", function () {
        openMonsters(function (npc) {
          putInFight(npc);
          onChange();
          if (root.isConnected) mountInit(root, page, onChange);
        });
      });
    }
    const fromCodex = root.querySelector("[data-pick-codex]");
    if (fromCodex) {
      fromCodex.addEventListener("click", function () {
        const rows = (catalog.npcs || []).filter(function (item) { return (item.name || "").trim(); }).map(function (item) {
          return { label: item.name, npc: item };
        });
        openList("Персонажи", rows, function (row) {
          const npc = row.npc;
          const person = newActor(npc.name || "Непись", 10, "npc");
          person.portrait = npc.portrait || "";
          person.picture = npc.picture || "";
          person.weapon = npc.weapon || "";
          person.damage = npc.damage || "";
          person.hp = Number(npc.hp) || 0;
          person.hpMax = Number(npc.hpMax) || 0;
          scene.actors.push(person);
          onChange();
          if (root.isConnected) mountInit(root, page, onChange);
        });
      });
    }
    const sortBtn = root.querySelector("[data-auto-sort]");
    if (sortBtn) {
      sortBtn.addEventListener("click", function () {
        commit(root, page);
        scene.autoSort = !scene.autoSort;
        onChange();
        mountInit(root, page, onChange);
      });
    }
    let dragFrom = -1;
    root.querySelectorAll("[data-drag]").forEach(function (grip) {
      grip.addEventListener("dragstart", function (event) {
        dragFrom = Number(grip.getAttribute("data-at"));
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(dragFrom));
        const tr = grip.closest("tr");
        if (tr) tr.classList.add("is-dragging");
      });
      grip.addEventListener("dragend", function () {
        dragFrom = -1;
        root.querySelectorAll("tr.is-dragging, tr.is-drop").forEach(function (tr) {
          tr.classList.remove("is-dragging");
          tr.classList.remove("is-drop");
        });
      });
    });
    root.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("dragover", function (event) {
        if (dragFrom < 0) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        tr.classList.add("is-drop");
      });
      tr.addEventListener("dragleave", function (event) {
        if (tr.contains(event.relatedTarget)) return;
        tr.classList.remove("is-drop");
      });
      tr.addEventListener("drop", function (event) {
        event.preventDefault();
        const grip = tr.querySelector("[data-drag]");
        const to = grip ? Number(grip.getAttribute("data-at")) : -1;
        const from = dragFrom;
        dragFrom = -1;
        if (from < 0 || to < 0 || from === to) return;
        commit(root, page);
        placeLayout(scene, from, to);
        onChange();
        mountInit(root, page, onChange);
      });
    });
    root.querySelectorAll("[data-sep]").forEach(function (input) {
      input.addEventListener("input", function () {
        const row = (scene.layout || []).find(function (item) { return item.id === input.getAttribute("data-sep"); });
        if (row) row.text = input.value;
        onChange();
      });
    });
    root.querySelectorAll("[data-sep-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-sep-del");
        scene.layout = (scene.layout || []).filter(function (row) { return row.id !== id; });
        onChange();
        mountInit(root, page, onChange);
      });
    });
    const sepAdd = root.querySelector("[data-sep-add]");
    if (sepAdd) {
      sepAdd.addEventListener("click", function () {
        commit(root, page);
        ensureLayout(scene);
        scene.layout.push({ kind: "sep", id: freshId(), text: "" });
        onChange();
        mountInit(root, page, onChange);
      });
    }
    root.querySelector("[data-add]").addEventListener("click", function () {
      commit(root, page);
      const top = scene.actors.reduce(function (max, person) { return Math.max(max, Number(person.init) || 0); }, 0);
      scene.actors.push(newActor("Новый", top + 1));
      onChange();
      mountInit(root, page, onChange);
    });
    root.querySelectorAll("[data-pick]").forEach(function (button) {
      button.addEventListener("click", function () {
        scene.activeId = button.getAttribute("data-pick");
        onChange();
        mountInit(root, page, onChange);
      });
    });
    root.querySelector("[data-next]").addEventListener("click", function () {
      advanceInit(scene);
      onChange();
      mountInit(root, page, onChange);
    });
  }

  function commit(root, page) {
    const kind = page ? editKindOf(page) : "free";
    if (!root || !page || kind === "free") return;
    if (root.classList.contains("hidden")) return;
    const scene = draftScene(page);
    if (!scene) return;
    if (kind === "talk") {
      ensurePlaces(scene);
      const place = placeOf(scene);
      const npc = selectedNpc(scene);
      const locName = root.querySelector("[data-loc-name]");
      if (locName) place.name = locName.value;
      const npcName = root.querySelector("[data-npc-name]");
      if (npc && npcName) npc.name = npcName.value;
      const lines = root.querySelector("[data-lines]");
      if (npc && lines) {
        const next = lines.value.split(/\n/);
        npc.lines = next.length ? next : ["..."];
        npc.line = Math.min(npc.line || 0, npc.lines.length - 1);
      }
      if (npc) {
        root.querySelectorAll("[data-item]").forEach(function (input) {
          const item = npc.goods && npc.goods[Number(input.getAttribute("data-i"))];
          if (item) item[input.getAttribute("data-item")] = input.value;
        });
        root.querySelectorAll("[data-loot]").forEach(function (input) {
          const item = npc.loot && npc.loot[Number(input.getAttribute("data-i"))];
          if (item) item[input.getAttribute("data-loot")] = input.value;
        });
        root.querySelectorAll("[data-party]").forEach(function (input) {
          const person = npc.party && npc.party[Number(input.getAttribute("data-i"))];
          if (!person) return;
          const key = input.getAttribute("data-party");
          person[key] = key === "init" || key === "hp" ? Number(input.value) : input.value;
        });
      }
    }
    if (kind === "initiative") {
      ensureInit(scene);
      const log = root.querySelector("[data-log]");
      if (log) scene.log = log.value;
      root.querySelectorAll("[data-actor]").forEach(function (input) {
        const person = scene.actors[Number(input.getAttribute("data-i"))];
        if (!person) return;
        const key = input.getAttribute("data-actor");
        person[key] = key === "init" || key === "hp" || key === "hpMax" ? Number(input.value) : input.value;
      });
    }
    page.scenes[kind] = scene;
    if ((page.kind || "free") === kind) page.scene = scene;
  }

  function copyRuntime(from, to) {
    if (!from || !to || from.kind !== to.kind || !from.scene || !to.scene) return;
    if (from.kind === "talk") {
      if (typeof from.scene.line === "number") to.scene.line = from.scene.line;
      to.scene.shopOpen = Boolean(from.scene.shopOpen);
      to.scene.openId = from.scene.openId || "";
      if (from.scene.locationId) to.scene.locationId = from.scene.locationId;
      if (from.scene.present === "place" || from.scene.present === "cast") to.scene.present = from.scene.present;
      to.scene.seen = from.scene.seen || to.scene.seen || null;
      to.scene.lootId = from.scene.lootId || "";
      to.scene.fightNpcId = from.scene.fightNpcId || "";
      to.scene.fight = from.scene.fight || null;
      (from.scene.locations || []).forEach(function (place) {
        (place.npcs || []).forEach(function (npc) {
          const live = npcOf(to.scene, npc.id);
          if (!live) return;
          live.line = npc.line || 0;
          live.shopOpen = Boolean(npc.shopOpen);
        });
      });
    }
    if (from.kind === "initiative" && from.scene.activeId) to.scene.activeId = from.scene.activeId;
  }

  function mergeRuntime(local, fresh) {
    if (!fresh || !Array.isArray(fresh.pages)) return;
    fresh.pages.forEach(function (saved) {
      const page = (local.pages || []).find(function (item) { return item.id === saved.id; });
      copyRuntime(saved, page);
    });
  }

  function freshId() {
    return window.ShirmoStore && ShirmoStore.uid ? ShirmoStore.uid() : String(Date.now()) + Math.random().toString(36).slice(2);
  }

  function csvCell(value) {
    const text = String(value == null ? "" : value);
    return /[;"\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function downloadCsv(rows, name) {
    const text = rows.map(function (row) { return row.map(csvCell).join(";"); }).join("\n");
    const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function parseTable(text) {
    const rows = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (line) { return line.trim(); });
    if (!rows.length) return [];
    const sep = rows[0].indexOf(";") !== -1 ? ";" : ",";
    let start = 0;
    if (/назван|name|монет|имя|цен|медь|оруж|товар/i.test(rows[0])) start = 1;
    const out = [];
    for (let i = start; i < rows.length; i++) out.push(splitRow(rows[i], sep).map(function (cell) { return cell.trim(); }));
    return out;
  }

  function shopNpc(scene) {
    ensurePlaces(scene);
    const place = placeOf(scene);
    let npc = selectedNpc(scene);
    if (!npc || !npc.peaceful) npc = (place.npcs || []).find(function (item) { return item.peaceful; }) || null;
    if (!npc) {
      npc = blankNpc("Торговец");
      place.npcs.push(npc);
      scene.npcId = npc.id;
    }
    npc.goods = npc.goods || [];
    npc.shopOpen = true;
    return npc;
  }

  function shopNames() {
    const page = pageNow();
    const scene = page && ((page.scenes && page.scenes.talk) || page.scene);
    if (!scene) return [];
    ensurePlaces(scene);
    const npc = selectedNpc(scene);
    return ((npc && npc.goods) || []).map(function (item) { return (item.name || "").trim().toLowerCase(); });
  }

  let libKind = "items";
  let libQuery = "";
  let libHits = [];

  function joinMeta(parts) {
    return parts.filter(function (part) { return part !== "" && part != null; }).join(" · ");
  }

  function libBook(id) {
    const books = window.ShirmoLibrary && ShirmoLibrary.books;
    return books && books[id] || "";
  }

  function libMeta(kind, row) {
    if (kind === "items") return joinMeta([row[1], row[2], row[3], row[5], row[4], libBook(row[6])]);
    if (kind === "monsters") {
      return joinMeta([
        row[1],
        row[2],
        row[3] !== "" ? "CR " + row[3] : "",
        row[4] ? "AC " + row[4] : "",
        row[5] ? "HP " + row[5] : "",
        row[6],
        row[7],
        libBook(row[8])
      ]);
    }
    if (kind === "spells") {
      const level = row[1] === "0" ? "заговор" : (row[1] !== "" ? row[1] + " круг" : "");
      return joinMeta([level, row[2], row[3], row[4], row[5], libBook(row[6])]);
    }
    if (kind === "classes") return joinMeta([row[1] ? "кость " + row[1] : "", libBook(row[2])]);
    if (kind === "species") return joinMeta([row[1], row[2], libBook(row[3])]);
    return libBook(row[1]);
  }

  function libActions(kind, index) {
    if (kind === "items") {
      return '<button type="button" data-lib-act="good" data-lib-i="' + index + '">В товары</button>' +
        '<button type="button" data-lib-act="shop" data-lib-i="' + index + '">В лавку</button>';
    }
    if (kind === "monsters") {
      return '<button type="button" data-lib-act="npc" data-lib-i="' + index + '">В персонажи</button>' +
        '<button type="button" data-lib-act="talk" data-lib-i="' + index + '">В разговор</button>' +
        '<button type="button" data-lib-act="fight" data-lib-i="' + index + '">В бой</button>';
    }
    return "";
  }

  function monsterCards() {
    const lib = window.ShirmoLibrary;
    const rows = (lib && lib.monsters) || [];
    const cards = rows.map(function (row) {
      const ru = ruOf("monsters", row[0]);
      const name = ru || row[0];
      const cr = row[3] !== "" && row[3] != null ? "CR " + row[3] : "";
      return { label: cr ? name + " · " + cr : name, q: name + " " + row[0], row: row, ru: Boolean(ru), beast: row[0] };
    });
    cards.sort(function (a, b) {
      if (a.ru !== b.ru) return a.ru ? -1 : 1;
      return a.label.localeCompare(b.label, "ru");
    });
    return cards;
  }

  function openMonsters(onPick) {
    openList("Монстры", monsterCards(), function (card) { onPick(npcFromMonster(card.row)); });
  }

  function paintLibrary(root) {
    const box = root.querySelector("#lib-results");
    if (!box) return;
    const lib = window.ShirmoLibrary;
    if (!lib) {
      libHits = [];
      box.innerHTML = '<p class="scene-note">База не загрузилась.</p>';
      return;
    }
    const query = libQuery.trim().toLowerCase();
    const browsing = libKind === "monsters" && query.length < 2;
    if (query.length < 2 && !browsing) {
      libHits = [];
      box.innerHTML = "";
      return;
    }
    const rows = lib[libKind] || [];
    const starts = [];
    const contains = [];
    for (let i = 0; i < rows.length; i++) {
      const ruName = ruOf(libKind, rows[i][0]);
      if (libKind === "items" && !ruName) continue;
      if (browsing && !ruName) continue;
      const en = String(rows[i][0]).toLowerCase();
      const ru = ruName.toLowerCase();
      if (!browsing) {
        const at = en.indexOf(query);
        const atRu = ru.indexOf(query);
        if (at < 0 && atRu < 0) continue;
        if (at === 0 || atRu === 0) starts.push(rows[i]);
        else contains.push(rows[i]);
      } else {
        starts.push(rows[i]);
      }
    }
    if (browsing) {
      starts.sort(function (a, b) {
        return ruOf("monsters", a[0]).localeCompare(ruOf("monsters", b[0]), "ru");
      });
    }
    const hits = starts.concat(contains).slice(0, 40);
    const more = starts.length + contains.length > 40;
    libHits = hits;
    const html = hits.map(function (row, index) {
      const actions = libActions(libKind, index);
      const ru = ruOf(libKind, row[0]);
      const title = ru || row[0];
      const meta = libMeta(libKind, row);
      return '<div class="lib-row"' + (libKind === "monsters" ? beastAttr(row[0]) : "") + '><b>' + esc(title) + '</b><span class="lib-meta">' + esc(meta) + "</span>" +
        (actions ? '<span class="lib-actions">' + actions + "</span>" : "<span></span>") + "</div>";
    }).join("");
    const tail = more
      ? '<p class="scene-note">' + (browsing ? "Первые 40. Введите имя, чтобы найти остальных." : "Показаны первые 40. Уточните запрос.") + "</p>"
      : (hits.length ? "" : '<p class="scene-note">Ничего не найдено.</p>');
    box.innerHTML = html + tail;
  }

  function ruOf(kind, en) {
    const pack = window.ShirmoRu;
    if (!pack) return "";
    const key = String(en || "").toLowerCase();
    if (kind === "items") return pack.items[key] || "";
    if (kind === "spells") return pack.spells[key] || "";
    if (kind === "monsters") return pack.monsters[key] ? pack.monsters[key][0] : "";
    return "";
  }

  function goodFromItem(row) {
    return {
      id: freshId(),
      name: ruOf("items", row[0]) || row[0],
      price: row[4] || "",
      note: joinMeta([row[1], row[2], row[3], row[5]]),
      image: ""
    };
  }

  function monsterFace(en) {
    const map = window.ShirmoFaces || {};
    const key = String(en || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return map[key] || "";
  }

  function npcFromMonster(row) {
    const extra = window.ShirmoRu && ShirmoRu.monsters[String(row[0]).toLowerCase()];
    const hp = Number(row[5]) || (extra && extra[3]) || 0;
    const ac = Number(row[4]) || (extra && extra[2]) || 0;
    const cr = row[3] || (extra && extra[1]) || "";
    const face = monsterFace(row[0]);
    return {
      id: freshId(),
      name: (extra && extra[0]) || row[0],
      note: joinMeta([row[1] || (extra && extra[4]) || "", row[2], cr !== "" ? "CR " + cr : "", ac ? "AC " + ac : "", libBook(row[8])]),
      portrait: face,
      picture: face,
      weapon: row[6] || "",
      damage: row[7] || "",
      hp: hp,
      hpMax: hp,
      origin: row[0]
    };
  }

  function sameCard(list, name, note) {
    const key = String(name || "").trim().toLowerCase();
    return (list || []).some(function (item) {
      return String(item.name || "").trim().toLowerCase() === key && (item.note || "") === (note || "");
    });
  }

  function putInShop(item) {
    const page = pageNow();
    if (!page || !(item.name || "").trim()) return;
    const scene = stash(page, "talk");
    const npc = shopNpc(scene);
    const key = item.name.trim().toLowerCase();
    const exists = npc.goods.some(function (good) { return (good.name || "").trim().toLowerCase() === key; });
    if (!exists) npc.goods.push({ name: item.name, price: item.price || "", note: item.note || "", image: item.image || "" });
  }

  function rememberNpc(npc) {
    if (!npc || !(npc.name || "").trim()) return;
    catalog.npcs = catalog.npcs || [];
    catalog.npcs.push({
      id: freshId(),
      name: npc.name,
      note: npc.note || "",
      portrait: npc.portrait || "",
      picture: npc.picture || "",
      weapon: npc.weapon || "",
      damage: npc.damage || "",
      hp: Number(npc.hp) || 0,
      hpMax: Number(npc.hpMax) || Number(npc.hp) || 0,
      origin: npc.origin || ""
    });
  }

  function putInTalk(npc) {
    const page = pageNow();
    if (!page) return;
    const source = npc && typeof npc === "object" ? npc : { name: npc };
    const scene = stash(page, "talk");
    ensurePlaces(scene);
    const person = blankNpc(source.name || "Непись");
    person.portrait = source.portrait || "";
    person.picture = source.picture || "";
    person.weapon = source.weapon || "";
    person.damage = source.damage || "";
    person.hp = Number(source.hp) || 0;
    person.hpMax = Number(source.hpMax) || Number(source.hp) || 0;
    person.origin = source.origin || "";
    placeOf(scene).npcs.push(person);
    scene.npcId = person.id;
    scene.npcName = person.name;
  }

  function putInFight(npc) {
    const page = pageNow();
    if (!page || !npc) return;
    const scene = stash(page, "initiative");
    ensureInit(scene);
    const person = newActor(npc.name || "Непись", 10, "npc");
    person.portrait = npc.portrait || "";
    person.picture = npc.picture || npc.portrait || "";
    person.weapon = npc.weapon || "";
    person.damage = npc.damage || "";
    person.hp = Number(npc.hp) || 0;
    person.hpMax = Number(npc.hpMax) || 0;
    person.origin = npc.origin || "";
    scene.actors.push(person);
    ensureLayout(scene);
    if (scene.autoSort) sortLayout(scene);
  }

  function placeBranch(parentId, depth) {
    return childrenOf(parentId).map(function (place) {
      const hideTitle = place.hidden ? "Показать в списке на ширме" : "Скрыть из списка на ширме";
      return '<div class="pick-line" style="margin-left:' + (depth * 14) + 'px">' +
        '<button type="button" class="pick-row' + (place.id === placeFocus ? " is-on" : "") + (place.hidden ? " is-hidden" : "") + '" data-place-pick="' + esc(place.id) + '">' +
        esc(place.name || "Место") + "</button>" +
        '<button type="button" class="side-btn' + (place.hidden ? "" : " is-on") + '" data-place-veil="' + esc(place.id) + '" title="' + hideTitle + '" aria-label="' + hideTitle + '">' +
        icon(place.hidden ? "blind" : "eye") + "</button></div>" + placeBranch(place.id, depth + 1);
    }).join("");
  }

  function copyOntoPlace(source, peaceful) {
    const place = placeById(placeFocus);
    if (!place || !source || !(source.name || "").trim()) return;
    const person = blankNpc(source.name);
    person.portrait = source.portrait || "";
    person.picture = source.picture || source.portrait || "";
    person.weapon = source.weapon || "";
    person.damage = source.damage || "";
    person.hp = Number(source.hp) || 0;
    person.hpMax = Number(source.hpMax) || Number(source.hp) || 0;
    person.origin = source.origin || "";
    person.peaceful = Boolean(peaceful);
    if (!person.peaceful) person.party = [npcActor(person)];
    place.npcs = place.npcs || [];
    place.npcs.push(person);
  }

  function spawnOnPlace(name, peaceful) {
    const card = {
      id: freshId(),
      name: name || "Непись",
      note: "",
      portrait: "",
      picture: "",
      weapon: "",
      damage: "",
      hp: 0,
      hpMax: 0
    };
    catalog.npcs = catalog.npcs || [];
    catalog.npcs.push(card);
    copyOntoPlace(card, peaceful);
  }

  function removePlace(id) {
    const place = placeById(id);
    if (!place) return;
    const parent = place.parentId || "";
    childrenOf(id).forEach(function (child) { child.parentId = parent; });
    catalog.places = worldPlaces().filter(function (item) { return item.id !== id; });
    if (!catalog.places.length) catalog.places.push(blankPlace("Место", ""));
    placeFocus = parent && placeById(parent) ? parent : (childrenOf("")[0] || catalog.places[0]).id;
  }

  function placePane() {
    const page = pageNow();
    const talk = page && page.scenes && page.scenes.talk;
    if (talk) ensurePlaces(talk);
    const places = worldPlaces();
    if (!places.length) places.push(blankPlace("Место", ""));
    if (!placeById(placeFocus)) placeFocus = (childrenOf("")[0] || places[0]).id;
    const place = placeById(placeFocus);
    const stationed = (place.npcs || []).map(function (npc, index) {
      return '<div class="pick-line"><span class="pick-row"' + beastAttr(npc.origin || npc.name) + '>' + esc(npc.name || "Непись") + (npc.peaceful ? "" : " · враг") +
        '</span><button type="button" class="danger" data-place-npc-del="' + index + '">×</button></div>';
    }).join("") || '<p class="scene-note">На месте никого нет.</p>';
    const options = (catalog.npcs || []).map(function (npc, index) {
      return '<option value="' + index + '">' + esc(npc.name || "Безымянный") + "</option>";
    }).join("");
    return '<div class="place-tree">' + (placeBranch("", 0) || '<p class="scene-note">Мест нет.</p>') + "</div>" +
      '<div class="row"><button type="button" data-place-add>Место</button><button type="button" data-place-child>Подлокация</button><button type="button" class="danger" data-place-del>Удалить</button></div>' +
      '<label class="scene-field"><span>Название</span><input data-place-name value="' + esc(place.name || "") + '" aria-label="Название места"></label>' +
      '<label class="check"><input type="checkbox" data-place-hidden' + (place.hidden ? " checked" : "") + '> Скрыть с ширмы</label>' +
      '<div class="scene-field"><span>Фон</span>' + fileBtn("data-place-bg", "image", "Фон", Boolean(safeSrc(place.background)), "image/*", "place-bg") + "</div>" +
      '<div class="queue-label"><b>На месте</b></div>' + stationed +
      '<div class="row"><select data-place-from aria-label="Персонаж"><option value="">Из персонажей</option>' + options + '</select><button type="button" data-place-put>На место</button><button type="button" data-place-enemy>Как враг</button></div>' +
      '<div class="row"><input data-place-new placeholder="Имя" aria-label="Новый персонаж"><button type="button" data-place-create>Персонаж</button><button type="button" data-place-hostile>Враг</button><button type="button" data-place-monsters>Монстры</button></div>';
  }

  function remountCodex(root, onChange) {
    const scroller = root.querySelector(".codex-scroll");
    const top = scroller ? scroller.scrollTop : 0;
    mountCodex(root, onChange);
    const next = root.querySelector(".codex-scroll");
    if (next) next.scrollTop = top;
  }

  function mountCodex(root, onChange) {
    const book = catalog;
    const names = shopNames();
    const npcs = (book.npcs || []).map(function (npc, index) {
      const face = safeSrc(npc.portrait);
      return '<tr><td>' + (face ? '<img class="codex-face" alt="" src="' + esc(face) + '">' : "") +
        '<input data-codex-npc="name" data-i="' + index + '"' + beastAttr(npc.origin || npc.name) + ' value="' + esc(npc.name || "") + '" aria-label="Имя"></td>' +
        '<td><input data-codex-npc="note" data-i="' + index + '" value="' + esc(npc.note || "") + '" aria-label="Заметка"></td>' +
        '<td><input data-codex-npc="weapon" data-i="' + index + '" value="' + esc(npc.weapon || "") + '" aria-label="Оружие"></td>' +
        '<td><input data-codex-npc="damage" data-i="' + index + '" value="' + esc(npc.damage || "") + '" aria-label="Урон"></td>' +
        '<td><input class="num" data-codex-npc="hp" data-i="' + index + '" type="number" min="0" value="' + esc(npc.hp || 0) + '" aria-label="ХП"></td>' +
        '<td><input class="num" data-codex-npc="hpMax" data-i="' + index + '" type="number" min="0" value="' + esc(npc.hpMax || 0) + '" aria-label="Максимум ХП"></td>' +
        "<td>" + fileBtn('data-npc-portrait="' + index + '"', "portrait", "Портрет", Boolean(safeSrc(npc.portrait)), "image/*", "npc-portrait:" + index) + "</td>" +
        "<td>" + fileBtn('data-npc-picture="' + index + '"', "shot", "Боевой облик", Boolean(safeSrc(npc.picture)), "image/*", "npc-picture:" + index) + "</td>" +
        '<td><button type="button" data-to-talk="' + index + '">В разговор</button></td>' +
        '<td><button type="button" data-to-fight="' + index + '">В бой</button></td>' +
        '<td><button type="button" class="danger" data-npc-del="' + index + '">×</button></td></tr>';
    }).join("");
    const goods = (book.goods || []).map(function (item, index) {
      const listed = names.indexOf((item.name || "").trim().toLowerCase()) >= 0;
      return '<tr><td><input data-codex-good="name" data-i="' + index + '" value="' + esc(item.name || "") + '" aria-label="Название"></td>' +
        '<td><input data-codex-good="price" data-i="' + index + '" value="' + esc(item.price || "") + '" aria-label="Цена"></td>' +
        '<td><input data-codex-good="note" data-i="' + index + '" value="' + esc(item.note || "") + '" aria-label="Заметка"></td>' +
        "<td>" + fileBtn('data-good-image="' + index + '"', "image", "Картинка товара", Boolean(safeSrc(item.image)), "image/*", "good-image:" + index) + "</td>" +
        '<td><button type="button" data-to-shop="' + index + '">В лавку</button> ' +
        '<button type="button"' + (listed ? "" : " disabled") + ' data-from-shop="' + index + '">Убрать</button></td>' +
        '<td><button type="button" class="danger" data-good-del="' + index + '">×</button></td></tr>';
    }).join("");
    const coins = (book.coins || []).map(function (coin, index) {
      return '<tr><td><input data-codex-coin="name" data-i="' + index + '" value="' + esc(coin.name || "") + '" aria-label="Монета"></td>' +
        '<td><input data-codex-coin="code" data-i="' + index + '" value="' + esc(coin.code || "") + '" aria-label="Код"></td>' +
        '<td><input class="num" data-codex-coin="copper" data-i="' + index + '" type="number" min="1" value="' + esc(coin.copper || 1) + '" aria-label="Медных в монете"></td>' +
        '<td><button type="button" class="danger" data-coin-del="' + index + '">×</button></td></tr>';
    }).join("");
    const kinds = [["items", "Предметы"], ["monsters", "Монстры"], ["spells", "Заклинания"], ["classes", "Классы"], ["species", "Виды"], ["backgrounds", "Предыстории"]];
    const kindChips = kinds.map(function (kind) {
      return '<button type="button" class="chip-btn' + (libKind === kind[0] ? " is-on" : "") + '" data-lib-kind="' + kind[0] + '">' + kind[1] + "</button>";
    }).join("");
    const panes = {
      base: '<div class="chip-row">' + kindChips + '</div><input id="lib-q" value="' + esc(libQuery) + '" placeholder="Поиск по имени, можно по-русски" aria-label="Поиск по базе"><div id="lib-results"></div>',
      npcs: '<div class="row"><input id="new-npc-name" placeholder="Бандит" aria-label="Имя"><label class="check"><input type="checkbox" id="own-name"' + (ownName ? " checked" : "") + '> Своё имя</label><button type="button" data-gen-new>Сгенерировать</button><button type="button" data-npc-add>Добавить</button><button type="button" data-monsters>Монстры</button>' +
        '<button type="button" data-csv-open="npcs" title="Поля, шаблон, выгрузка и загрузка">CSV</button></div>' +
        nameChips() +
        '<table class="cast"><thead><tr><th>Имя</th><th>Заметка</th><th>Оружие</th><th>Урон</th><th>ХП</th><th>Макс</th><th></th><th></th><th></th><th></th><th></th></tr></thead><tbody>' +
        npcs + "</tbody></table>",
      goods: '<div class="row"><button type="button" data-good-add>Добавить</button><button type="button" data-csv-open="goods" title="Поля, шаблон, выгрузка и загрузка">CSV</button></div>' +
        rollBox("catalog") +
        '<table class="cast"><thead><tr><th>Название</th><th>Цена</th><th>Заметка</th><th></th><th></th><th></th></tr></thead><tbody>' +
        goods + "</tbody></table>",
      coins: '<div class="row"><button type="button" data-coin-add>Добавить</button><button type="button" data-csv-open="coins" title="Поля, шаблон, выгрузка и загрузка">CSV</button></div>' +
        coinLine() +
        '<table class="cast"><thead><tr><th>Монета</th><th>Код</th><th>Медных</th><th></th></tr></thead><tbody>' +
        coins + "</tbody></table>",
      places: placePane()
    };
    const tabs = [["base", "База"], ["places", "Места"], ["npcs", "Персонажи"], ["goods", "Товары"], ["coins", "Валюты"]].map(function (tab) {
      return '<button type="button" class="chip-btn' + (codexPane === tab[0] ? " is-on" : "") + '" data-pane="' + tab[0] + '">' + tab[1] + "</button>";
    }).join("");
    const docked = root.id === "codex";
    const head = docked ? "" : '<div class="pop-head"><h2>Справочник</h2><button type="button" data-pop-close>×</button></div>';
    root.innerHTML = '<div class="' + (docked ? "codex-dock" : "pop-card") + '" role="dialog">' + head +
      '<div class="chip-row">' + tabs + '</div><p class="scene-note">Имена: <a href="https://tentaculus.ru/spells">tentaculus.ru</a>, CC BY-NC-SA 3.0. В разговор и в бой берутся из списка персонажей.</p><div class="codex-scroll">' +
      (panes[codexPane] || panes.npcs) + "</div></div>";
    bindCodex(root, onChange);
  }

  function bindCodex(root, onChange) {
    const close = root.querySelector("[data-pop-close]");
    if (close) close.addEventListener("click", function () { root.classList.add("hidden"); });
    if (!root.dataset.bound && root.id !== "codex") {
      root.dataset.bound = "1";
      root.addEventListener("click", function (event) {
        if (event.target === root) root.classList.add("hidden");
      });
    }
    root.querySelectorAll("[data-pane]").forEach(function (button) {
      button.addEventListener("click", function () {
        codexPane = button.getAttribute("data-pane");
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-lib-kind]").forEach(function (button) {
      button.addEventListener("click", function () {
        libKind = button.getAttribute("data-lib-kind");
        paintLibrary(root);
        root.querySelectorAll("[data-lib-kind]").forEach(function (chip) {
          chip.classList.toggle("is-on", chip.getAttribute("data-lib-kind") === libKind);
        });
      });
    });
    const queryInput = root.querySelector("#lib-q");
    if (queryInput) {
      queryInput.addEventListener("input", function () {
        libQuery = queryInput.value;
        paintLibrary(root);
      });
    }
    const libBox = root.querySelector("#lib-results");
    if (libBox) {
      libBox.addEventListener("click", function (event) {
        const button = event.target.closest("[data-lib-act]");
        if (!button) return;
        const row = libHits[Number(button.getAttribute("data-lib-i"))];
        if (!row) return;
        const act = button.getAttribute("data-lib-act");
        if (act === "good" || act === "shop") {
          const item = goodFromItem(row);
          if (act === "good" && !sameCard(catalog.goods, item.name, item.note)) catalog.goods.push(item);
          if (act === "shop") putInShop(item);
          onChange();
          remountCodex(root, onChange);
          return;
        }
        const npc = npcFromMonster(row);
        rememberNpc(npc);
        if (act === "npc") {
          codexPane = "npcs";
          onChange();
          remountCodex(root, onChange);
          return;
        }
        if (act === "talk") putInTalk(npc);
        if (act === "fight") putInFight(npc);
        onChange();
      });
    }
    paintLibrary(root);
    function npcAt(index) { return catalog.npcs[index]; }
    root.querySelectorAll("[data-codex-npc]").forEach(function (input) {
      input.addEventListener("input", function () {
        const npc = npcAt(Number(input.getAttribute("data-i")));
        if (!npc) return;
        const key = input.getAttribute("data-codex-npc");
        npc[key] = key === "hp" || key === "hpMax" ? Number(input.value) : input.value;
        onChange();
      });
    });
    root.querySelectorAll("[data-codex-good]").forEach(function (input) {
      input.addEventListener("input", function () {
        const item = catalog.goods[Number(input.getAttribute("data-i"))];
        if (!item) return;
        item[input.getAttribute("data-codex-good")] = input.value;
        onChange();
      });
    });
    root.querySelectorAll("[data-codex-coin]").forEach(function (input) {
      input.addEventListener("input", function () {
        const coin = catalog.coins[Number(input.getAttribute("data-i"))];
        if (!coin) return;
        const key = input.getAttribute("data-codex-coin");
        coin[key] = key === "copper" ? Number(input.value) : input.value;
        if (key === "copper") {
          const line = root.querySelector(".coin-line");
          const next = coinLine();
          if (line && next) line.outerHTML = next;
        }
        onChange();
      });
    });
    root.querySelectorAll("[data-npc-portrait], [data-npc-picture]").forEach(function (input) {
      input.addEventListener("change", async function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const index = Number(input.getAttribute("data-npc-portrait") != null && input.hasAttribute("data-npc-portrait") ? input.getAttribute("data-npc-portrait") : input.getAttribute("data-npc-picture"));
        const npc = npcAt(index);
        if (!npc) return;
        npc[input.hasAttribute("data-npc-portrait") ? "portrait" : "picture"] = await readData(file);
        onChange();
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-good-image]").forEach(function (input) {
      input.addEventListener("change", async function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const item = catalog.goods[Number(input.getAttribute("data-good-image"))];
        if (!item) return;
        item.image = await readData(file);
        onChange();
        mountCodex(root, onChange);
      });
    });
    const ownBox = root.querySelector("#own-name");
    if (ownBox) ownBox.addEventListener("change", function () { ownName = ownBox.checked; });
    const genNew = root.querySelector("[data-gen-new]");
    if (genNew) genNew.addEventListener("click", function () {
      const input = root.querySelector("#new-npc-name");
      if (input) input.value = generateName(nameList);
    });
    const addNpc = root.querySelector("[data-npc-add]");
    if (addNpc) addNpc.addEventListener("click", function () {
      const input = root.querySelector("#new-npc-name");
      catalog.npcs.push({ id: freshId(), name: chosenName(input && input.value), note: "", portrait: "", picture: "", weapon: "", damage: "", hp: 0, hpMax: 0 });
      onChange();
      mountCodex(root, onChange);
    });
    const fromMonsters = root.querySelector("[data-monsters]");
    if (fromMonsters) fromMonsters.addEventListener("click", function () {
      openMonsters(function (npc) {
        rememberNpc(npc);
        onChange();
        remountCodex(root, onChange);
      });
    });
    const placeMonsters = root.querySelector("[data-place-monsters]");
    if (placeMonsters) placeMonsters.addEventListener("click", function () {
      openMonsters(function (npc) {
        rememberNpc(npc);
        copyOntoPlace(npc, false);
        onChange();
        remountCodex(root, onChange);
      });
    });
    const addGood = root.querySelector("[data-good-add]");
    if (addGood) addGood.addEventListener("click", function () {
      catalog.goods.push({ id: freshId(), name: "", price: "", note: "", image: "" });
      onChange();
      mountCodex(root, onChange);
    });
    const addCoin = root.querySelector("[data-coin-add]");
    if (addCoin) addCoin.addEventListener("click", function () {
      catalog.coins.push({ id: freshId(), name: "Монета", code: "", copper: 1 });
      onChange();
      mountCodex(root, onChange);
    });
    bindRoll(root, function (item) {
      catalog.goods.push({ id: freshId(), name: item.name, price: item.price, note: item.note, image: "" });
      onChange();
      mountCodex(root, onChange);
    });
    root.querySelectorAll("[data-clear]").forEach(function (button) {
      button.addEventListener("click", function () {
        const bits = button.getAttribute("data-clear").split(":");
        const index = Number(bits[1]);
        if (bits[0] === "npc-portrait" && catalog.npcs[index]) catalog.npcs[index].portrait = "";
        if (bits[0] === "npc-picture" && catalog.npcs[index]) catalog.npcs[index].picture = "";
        if (bits[0] === "good-image" && catalog.goods[index]) catalog.goods[index].image = "";
        onChange();
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-npc-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        catalog.npcs.splice(Number(button.getAttribute("data-npc-del")), 1);
        onChange();
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-good-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        catalog.goods.splice(Number(button.getAttribute("data-good-del")), 1);
        onChange();
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-coin-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        catalog.coins.splice(Number(button.getAttribute("data-coin-del")), 1);
        onChange();
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-to-talk]").forEach(function (button) {
      button.addEventListener("click", function () {
        const page = pageNow();
        const npc = npcAt(Number(button.getAttribute("data-to-talk")));
        if (!page || !npc) return;
        putInTalk(npc);
        onChange();
      });
    });
    root.querySelectorAll("[data-to-fight]").forEach(function (button) {
      button.addEventListener("click", function () {
        const page = pageNow();
        const npc = npcAt(Number(button.getAttribute("data-to-fight")));
        if (!page || !npc) return;
        const scene = stash(page, "initiative");
        ensureInit(scene);
        const person = newActor(npc.name || "Непись", 10, "npc");
        person.portrait = npc.portrait || "";
        person.picture = npc.picture || "";
        person.weapon = npc.weapon || "";
        person.damage = npc.damage || "";
        person.hp = Number(npc.hp) || 0;
        person.hpMax = Number(npc.hpMax) || 0;
        scene.actors.push(person);
        ensureLayout(scene);
        if (scene.autoSort) sortLayout(scene);
        onChange();
      });
    });
    root.querySelectorAll("[data-to-shop]").forEach(function (button) {
      button.addEventListener("click", function () {
        const page = pageNow();
        const item = catalog.goods[Number(button.getAttribute("data-to-shop"))];
        if (!page || !item || !(item.name || "").trim()) return;
        const scene = stash(page, "talk");
        const npc = shopNpc(scene);
        npc.goods.push({ name: item.name, price: item.price || "", note: item.note || "", image: item.image || "" });
        onChange();
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-from-shop]").forEach(function (button) {
      button.addEventListener("click", function () {
        const page = pageNow();
        const item = catalog.goods[Number(button.getAttribute("data-from-shop"))];
        if (!page || !item) return;
        const scene = stash(page, "talk");
        const npc = shopNpc(scene);
        const key = (item.name || "").trim().toLowerCase();
        npc.goods = npc.goods.filter(function (good) { return (good.name || "").trim().toLowerCase() !== key; });
        onChange();
        mountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-csv-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        openCsv(button.getAttribute("data-csv-open"), root, onChange);
      });
    });
    root.querySelectorAll("[data-place-pick]").forEach(function (button) {
      button.addEventListener("click", function () {
        placeFocus = button.getAttribute("data-place-pick");
        remountCodex(root, onChange);
      });
    });
    root.querySelectorAll("[data-place-veil]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        const spot = placeById(button.getAttribute("data-place-veil"));
        if (!spot) return;
        spot.hidden = !spot.hidden;
        onChange();
        remountCodex(root, onChange);
      });
    });
    const placeAdd = root.querySelector("[data-place-add]");
    if (placeAdd) placeAdd.addEventListener("click", function () {
      const current = placeById(placeFocus);
      const next = blankPlace("Место", current ? current.parentId || "" : "");
      worldPlaces().push(next);
      placeFocus = next.id;
      onChange();
      remountCodex(root, onChange);
    });
    const placeChild = root.querySelector("[data-place-child]");
    if (placeChild) placeChild.addEventListener("click", function () {
      if (!placeById(placeFocus)) return;
      const next = blankPlace("Подлокация", placeFocus);
      worldPlaces().push(next);
      placeFocus = next.id;
      onChange();
      remountCodex(root, onChange);
    });
    const placeDel = root.querySelector("[data-place-del]");
    if (placeDel) placeDel.addEventListener("click", function () {
      removePlace(placeFocus);
      onChange();
      remountCodex(root, onChange);
    });
    const placeName = root.querySelector("[data-place-name]");
    if (placeName) placeName.addEventListener("input", function () {
      const place = placeById(placeFocus);
      if (place) place.name = placeName.value;
      onChange();
    });
    const placeHidden = root.querySelector("[data-place-hidden]");
    if (placeHidden) placeHidden.addEventListener("change", function () {
      const place = placeById(placeFocus);
      if (!place) return;
      place.hidden = placeHidden.checked;
      onChange();
      remountCodex(root, onChange);
    });
    root.querySelectorAll("[data-place-npc-del]").forEach(function (button) {
      button.addEventListener("click", function () {
        const place = placeById(placeFocus);
        if (!place) return;
        place.npcs.splice(Number(button.getAttribute("data-place-npc-del")), 1);
        onChange();
        remountCodex(root, onChange);
      });
    });
    function chosenCatalog() {
      const select = root.querySelector("[data-place-from]");
      if (!select || select.value === "") return null;
      return (catalog.npcs || [])[Number(select.value)] || null;
    }
    const placePut = root.querySelector("[data-place-put]");
    if (placePut) placePut.addEventListener("click", function () {
      copyOntoPlace(chosenCatalog(), true);
      onChange();
      remountCodex(root, onChange);
    });
    const placeEnemy = root.querySelector("[data-place-enemy]");
    if (placeEnemy) placeEnemy.addEventListener("click", function () {
      copyOntoPlace(chosenCatalog(), false);
      onChange();
      remountCodex(root, onChange);
    });
    function typedPlaceName() {
      const input = root.querySelector("[data-place-new]");
      return chosenName(input && input.value);
    }
    const placeCreate = root.querySelector("[data-place-create]");
    if (placeCreate) placeCreate.addEventListener("click", function () {
      spawnOnPlace(typedPlaceName(), true);
      onChange();
      remountCodex(root, onChange);
    });
    const placeHostile = root.querySelector("[data-place-hostile]");
    if (placeHostile) placeHostile.addEventListener("click", function () {
      spawnOnPlace(typedPlaceName(), false);
      onChange();
      remountCodex(root, onChange);
    });
    const placeBg = root.querySelector("[data-place-bg]");
    if (placeBg) placeBg.addEventListener("change", async function () {
      const file = placeBg.files && placeBg.files[0];
      const place = placeById(placeFocus);
      if (!file || !place) return;
      place.background = await readData(file);
      onChange();
      remountCodex(root, onChange);
    });
    root.querySelectorAll('[data-clear="place-bg"]').forEach(function (button) {
      button.addEventListener("click", function () {
        const place = placeById(placeFocus);
        if (!place) return;
        place.background = "";
        onChange();
        remountCodex(root, onChange);
      });
    });
  }

  const csvSheets = {
    npcs: {
      title: "Персонажи",
      file: "personazhi.csv",
      head: ["имя", "заметка", "оружие", "урон", "хп", "хпмакс"],
      sample: ["Бандит", "у дороги", "меч", "1d8+2", "11", "11"],
      fields: [
        ["имя", "обязательно. Дубли ищутся по имени."],
        ["заметка", "можно пусто"],
        ["оружие", "можно пусто"],
        ["урон", "формула, например 1d8+2"],
        ["хп", "число"],
        ["хпмакс", "число"]
      ]
    },
    goods: {
      title: "Товары",
      file: "tovary.csv",
      head: ["название", "цена", "заметка"],
      sample: ["Факел", "1 мм", ""],
      fields: [
        ["название", "обязательно. Дубли ищутся по названию."],
        ["цена", "например 2 зм"],
        ["заметка", "можно пусто"]
      ]
    },
    coins: {
      title: "Валюты",
      file: "valyuty.csv",
      head: ["монета", "код", "медь"],
      sample: ["Золотая", "зм", "100"],
      fields: [
        ["монета", "обязательно. Дубли ищутся по имени и по коду."],
        ["код", "коротко, например зм"],
        ["медь", "сколько медных в одной такой монете"]
      ]
    }
  };

  function csvKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function csvRowsOf(kind) {
    const sheet = csvSheets[kind];
    if (kind === "npcs") {
      return [sheet.head].concat((catalog.npcs || []).map(function (npc) {
        return [npc.name, npc.note, npc.weapon, npc.damage, npc.hp || 0, npc.hpMax || 0];
      }));
    }
    if (kind === "goods") {
      return [sheet.head].concat((catalog.goods || []).map(function (item) {
        return [item.name, item.price, item.note];
      }));
    }
    return [sheet.head].concat((catalog.coins || []).map(function (coin) {
      return [coin.name, coin.code, coin.copper];
    }));
  }

  function csvRecord(kind, cols, prev) {
    const name = String(cols[0] || "").trim();
    if (kind === "npcs") {
      return {
        id: prev && prev.id || freshId(),
        name: name,
        note: cols[1] || "",
        weapon: cols[2] || "",
        damage: cols[3] || "",
        hp: Number(cols[4]) || 0,
        hpMax: Number(cols[5]) || 0,
        portrait: prev && prev.portrait || "",
        picture: prev && prev.picture || ""
      };
    }
    if (kind === "goods") {
      return {
        id: prev && prev.id || freshId(),
        name: name,
        price: cols[1] || "",
        note: cols[2] || "",
        image: prev && prev.image || ""
      };
    }
    return { id: prev && prev.id || freshId(), name: name, code: cols[1] || "", copper: Number(cols[2]) || 1 };
  }

  function csvList(kind) {
    if (kind === "npcs") return catalog.npcs;
    if (kind === "goods") return catalog.goods;
    return catalog.coins;
  }

  function csvTaken(kind, item, name, code) {
    if (csvKey(item.name) === name) return true;
    return kind === "coins" && code && csvKey(item.code) === code;
  }

  function applyCsv(kind, rows, mode) {
    catalog.npcs = catalog.npcs || [];
    catalog.goods = catalog.goods || [];
    catalog.coins = catalog.coins || [];
    const fileDupes = [];
    const exist = [];
    const seen = {};
    const clean = [];
    rows.forEach(function (cols) {
      const name = String(cols[0] || "").trim();
      if (!name) return;
      const keys = ["n:" + csvKey(name)];
      const codeKey = kind === "coins" ? csvKey(cols[1]) : "";
      if (codeKey) keys.push("c:" + codeKey);
      if (keys.some(function (key) { return seen[key]; })) {
        fileDupes.push(name);
        return;
      }
      keys.forEach(function (key) { seen[key] = true; });
      clean.push(cols);
    });
    const list = csvList(kind);
    if (mode === "replace") {
      const next = clean.map(function (cols) {
        return csvRecord(kind, cols, bookKeep(list, cols[0]));
      });
      if (kind === "npcs") catalog.npcs = next;
      else if (kind === "goods") catalog.goods = next;
      else catalog.coins = next;
      return { mode: mode, kept: next.length, added: next.length, fileDupes: fileDupes, exist: exist };
    }
    let added = 0;
    clean.forEach(function (cols) {
      const nameKey = csvKey(cols[0]);
      const codeKey = kind === "coins" ? csvKey(cols[1]) : "";
      const hit = list.some(function (item) { return csvTaken(kind, item, nameKey, codeKey); });
      if (hit) {
        exist.push(String(cols[0]).trim());
        return;
      }
      list.push(csvRecord(kind, cols, null));
      added += 1;
    });
    return { mode: mode, kept: list.length, added: added, fileDupes: fileDupes, exist: exist };
  }

  function csvReport(result) {
    if (!result) return "";
    const parts = [];
    if (result.mode === "replace") parts.push("Текущие записи заменены. В списке " + result.kept + ".");
    else if (!result.added && !result.fileDupes.length && !result.exist.length) parts.push("В файле нет строк с названием.");
    else parts.push("Добавлено " + result.added + ".");
    if (result.fileDupes.length) parts.push("Повторы в файле пропущены: " + result.fileDupes.join(", ") + ".");
    if (result.exist.length) parts.push("Уже были, не добавлены: " + result.exist.join(", ") + ".");
    return parts.join(" ");
  }

  function openCsv(kind, root, onChange) {
    const sheet = csvSheets[kind];
    const pop = document.getElementById("pop");
    if (!sheet || !pop) return;
    const fields = sheet.fields.map(function (field) {
      return "<li><b>" + esc(field[0]) + "</b> — " + esc(field[1]) + "</li>";
    }).join("");
    pop.classList.remove("hidden");
    pop.innerHTML = '<div class="pop-card csv-card" role="dialog"><div class="pop-head"><h2>' + esc(sheet.title) +
      '</h2><button type="button" data-pop-close>×</button></div>' +
      '<p class="scene-note">Колонки через точку с запятой. Первая строка — названия полей, она не загружается.</p>' +
      '<ul class="csv-fields">' + fields + "</ul>" +
      '<div class="row"><label class="check"><input type="radio" name="csv-mode" value="add" checked> Добавить к текущим</label>' +
      '<label class="check"><input type="radio" name="csv-mode" value="replace"> Удалить текущие</label></div>' +
      '<div class="row"><button type="button" data-csv-export>Выгрузить текущие</button>' +
      '<button type="button" data-csv-template>Скачать шаблон</button>' +
      '<button type="button" data-csv-pick>Загрузить файл</button>' +
      '<input data-csv-file class="hidden" type="file" accept=".csv,text/csv"></div>' +
      '<p class="scene-note csv-report" data-csv-report></p></div>';
    function close() { pop.classList.add("hidden"); }
    pop.querySelector("[data-pop-close]").addEventListener("click", close);
    if (pop._csvAway) pop.removeEventListener("click", pop._csvAway);
    pop._csvAway = function (event) {
      if (event.target === pop) close();
    };
    pop.addEventListener("click", pop._csvAway);
    pop.querySelector("[data-csv-export]").addEventListener("click", function () {
      downloadCsv(csvRowsOf(kind), sheet.file);
    });
    pop.querySelector("[data-csv-template]").addEventListener("click", function () {
      downloadCsv([sheet.head, sheet.sample], "shablon-" + sheet.file);
    });
    const file = pop.querySelector("[data-csv-file]");
    pop.querySelector("[data-csv-pick]").addEventListener("click", function () { file.click(); });
    file.addEventListener("change", async function () {
      const picked = file.files && file.files[0];
      file.value = "";
      if (!picked) return;
      const modeNode = pop.querySelector('input[name="csv-mode"]:checked');
      const mode = modeNode && modeNode.value === "replace" ? "replace" : "add";
      const result = applyCsv(kind, parseTable(await picked.text()), mode);
      const report = pop.querySelector("[data-csv-report]");
      if (report) report.textContent = csvReport(result);
      onChange();
      if (root.isConnected) mountCodex(root, onChange);
    });
  }

  function bookKeep(list, name) {
    const key = String(name || "").trim().toLowerCase();
    return (list || []).find(function (item) { return String(item.name || "").trim().toLowerCase() === key; });
  }

  function beastAttr(name) {
    const key = String(name || "").trim();
    if (!key) return "";
    return ' data-beast="' + esc(key) + '"';
  }

  const BEAST_SIZE = {
    tiny: "крошечный",
    small: "маленький",
    medium: "средний",
    large: "большой",
    huge: "огромный",
    gargantuan: "громадный"
  };

  let beastMap = null;

  function beastScore(row) {
    return (row[6] ? 4 : 0) + (Number(row[5]) ? 2 : 0) + (monsterFace(row[0]) ? 1 : 0);
  }

  function beastByName(name) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return null;
    if (!beastMap) {
      beastMap = {};
      const rows = (window.ShirmoLibrary && ShirmoLibrary.monsters) || [];
      rows.forEach(function (row) {
        const en = String(row[0] || "").toLowerCase();
        const ru = String(ruOf("monsters", row[0]) || "").toLowerCase();
        [en, ru].forEach(function (id) {
          if (!id) return;
          const prev = beastMap[id];
          if (!prev || beastScore(row) > beastScore(prev)) beastMap[id] = row;
        });
      });
    }
    return beastMap[key] || null;
  }

  function beastCard(row) {
    const extra = window.ShirmoRu && ShirmoRu.monsters[String(row[0]).toLowerCase()];
    const name = (extra && extra[0]) || row[0];
    const size = BEAST_SIZE[String(row[1] || "").toLowerCase()] || "";
    const type = (extra && extra[4]) || row[2] || "";
    const cr = row[3] !== "" && row[3] != null ? row[3] : (extra && extra[1]) || "";
    const ac = Number(row[4]) || (extra && extra[2]) || 0;
    const hp = Number(row[5]) || (extra && extra[3]) || 0;
    const face = safeSrc(monsterFace(row[0]));
    const lines = [];
    if (size || type) lines.push(esc([size, type].filter(Boolean).join(", ")));
    const stats = [];
    if (cr !== "" && cr != null) stats.push("CR " + cr);
    if (ac) stats.push("AC " + ac);
    if (hp) stats.push("HP " + hp);
    if (stats.length) lines.push(esc(stats.join(" · ")));
    if (row[6] || row[7]) lines.push(esc([row[6], row[7]].filter(Boolean).join(" · ")));
    const book = libBook(row[8]);
    if (book) lines.push('<i class="beast-book">' + esc(book) + "</i>");
    return (face ? '<img alt="" src="' + esc(face) + '">' : "") +
      '<div class="beast-copy"><b>' + esc(name) + "</b>" +
      lines.map(function (line) { return "<span>" + line + "</span>"; }).join("") + "</div>";
  }

  function beastTipEl() {
    let tip = document.getElementById("beast-tip");
    if (!tip) {
      tip = document.createElement("div");
    tip.id = "beast-tip";
    tip.className = "beast-tip hidden";
    tip.style.pointerEvents = "none";
      document.body.appendChild(tip);
    }
    return tip;
  }

  function hideBeast() {
    const tip = document.getElementById("beast-tip");
    if (tip) tip.classList.add("hidden");
  }

  function placeBeast(tip, node) {
    const box = node.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    let left = box.right + 10;
    if (left + width > window.innerWidth - 8) left = box.left - width - 10;
    if (left < 8) left = 8;
    let top = box.top;
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function bindBeastTip() {
    if (location.search.indexOf("view=play") >= 0) return;
    document.addEventListener("mouseover", function (event) {
      const node = event.target.closest("[data-beast]");
      if (!node || !node.isConnected) {
        hideBeast();
        return;
      }
      const row = beastByName(node.getAttribute("data-beast"));
      if (!row) {
        hideBeast();
        return;
      }
      const tip = beastTipEl();
      tip.innerHTML = beastCard(row);
      tip.classList.remove("hidden");
      placeBeast(tip, node);
    });
    document.addEventListener("pointerdown", function () { hideBeast(); });
    document.addEventListener("mouseout", function (event) {
      const node = event.target.closest("[data-beast]");
      if (!node) return;
      const next = event.relatedTarget;
      if (next && node.contains(next)) return;
      hideBeast();
    });
    document.addEventListener("scroll", hideBeast, true);
  }

  function setRoll(fn) { publishRoll = fn || function () {}; }

  function setHit(fn) { publishHit = fn || function () {}; }

  bindBeastTip();

  window.ShirmoScenes = {
    mount: mount,
    mountCodex: mountCodex,
    renderPlay: renderPlay,
    commit: commit,
    setContext: setContext,
    mergeRuntime: mergeRuntime,
    setRoll: setRoll,
    setHit: setHit
  };
})();
