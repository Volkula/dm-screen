(function () {
  const state = {
    canvas: null,
    name: "",
    rate: 70,
    size: 70,
    parts: [],
    acc: 0,
    hazeAcc: 0,
    raf: 0,
    last: 0,
    puff: null
  };

  function clamp(value, fallback) {
    const n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.max(1, Math.min(100, n));
  }

  function sprite() {
    if (state.puff) return state.puff;
    const made = [];
    for (let n = 0; n < 4; n++) {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      for (let blob = 0; blob < 5; blob++) {
        const x = 50 + ((n * 17 + blob * 29) % 60);
        const y = 48 + ((n * 13 + blob * 23) % 64);
        const glow = ctx.createRadialGradient(x, y, 4, x, y, 46);
        glow.addColorStop(0, "rgba(186, 180, 172, 0.55)");
        glow.addColorStop(0.55, "rgba(140, 134, 126, 0.2)");
        glow.addColorStop(1, "rgba(110, 106, 100, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 160, 160);
      }
      made.push(canvas);
    }
    state.puff = made;
    return made;
  }

  function resize() {
    const canvas = state.canvas;
    if (!canvas) return null;
    const w = canvas.clientWidth || 0;
    const h = canvas.clientHeight || 0;
    if (w < 2 || h < 2) return null;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w: w, h: h, ctx: canvas.getContext("2d") };
  }

  function spawnSmoke(w, h) {
    const bulk = 0.55 + (state.size / 100) * 1.35;
    return {
      x: Math.random() * w,
      y: h * (0.5 + Math.random() * 0.55),
      rad: w * (0.022 + Math.random() * 0.04) * bulk,
      vx: (Math.random() - 0.5) * 22,
      vy: -(8 + Math.random() * 20),
      spin: (Math.random() - 0.5) * 0.25,
      ang: Math.random() * Math.PI,
      kind: (Math.random() * 4) | 0,
      alpha: 0.22 + Math.random() * 0.28,
      life: 1,
      decay: 0.07 + Math.random() * 0.05
    };
  }

  function spawnFog(w, h) {
    const bulk = 0.9 + (state.size / 100) * 1.7;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      rad: w * (0.045 + Math.random() * 0.07) * bulk,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 10,
      spin: (Math.random() - 0.5) * 0.12,
      ang: Math.random() * Math.PI,
      kind: (Math.random() * 4) | 0,
      alpha: 0.34 + Math.random() * 0.4,
      life: 1,
      decay: 0.03 + Math.random() * 0.025
    };
  }

  function spawnSnow(w) {
    const bulk = 0.35 + (state.size / 100) * 1.4;
    return {
      home: Math.random() * w,
      y: -12 - Math.random() * 40,
      rad: (1.4 + Math.random() * 3.6) * bulk,
      vy: 28 + Math.random() * 80,
      sway: Math.random() * Math.PI * 2,
      amp: 12 + Math.random() * 36,
      alpha: 0.55 + Math.random() * 0.4
    };
  }

  function flameReach(h) {
    return h * (0.07 + (state.size / 100) * 0.52);
  }

  function spawnSpark(w, h) {
    const reach = flameReach(h);
    return {
      role: "spark",
      x: Math.random() * w,
      y: h - Math.random() * reach * 0.9,
      vx: (Math.random() - 0.5) * 28,
      vy: -(50 + Math.random() * 160),
      rad: 1.1 + Math.random() * 2.2,
      life: 1,
      decay: 0.7 + Math.random() * 0.9,
      hot: Math.random()
    };
  }

  function spawnFireSmoke(w, h) {
    const reach = flameReach(h);
    return {
      role: "smoke",
      x: Math.random() * w,
      y: h - reach * (0.72 + Math.random() * 0.35),
      rad: w * (0.018 + Math.random() * 0.028),
      vx: (Math.random() - 0.5) * 18,
      vy: -(14 + Math.random() * 26),
      spin: (Math.random() - 0.5) * 0.2,
      ang: Math.random() * Math.PI,
      kind: (Math.random() * 4) | 0,
      alpha: 0.16 + Math.random() * 0.2,
      life: 1,
      decay: 0.1 + Math.random() * 0.06
    };
  }

  function pushSpawn(accName, perSec, cap, make) {
    state[accName] += perSec;
    let guard = 0;
    while (state[accName] >= 1 && guard < 8) {
      const have = state.parts.reduce(function (sum, bit) { return sum + (bit.role === make.role ? 1 : 0); }, 0);
      if (have >= cap) {
        state[accName] = 0;
        break;
      }
      state[accName] -= 1;
      state.parts.push(make.fn());
      guard += 1;
    }
  }

  function step(now) {
    state.raf = requestAnimationFrame(step);
    const view = resize();
    if (!view || !state.name) return;
    const dt = Math.min(0.05, state.last ? (now - state.last) / 1000 : 0.016);
    state.last = now;
    if (state.name === "fire") {
      pushSpawn("acc", dt * (state.rate / 100) * 70, 160, { role: "spark", fn: function () { return spawnSpark(view.w, view.h); } });
      pushSpawn("hazeAcc", dt * (state.rate / 100) * 12, 80, { role: "smoke", fn: function () { return spawnFireSmoke(view.w, view.h); } });
      drawFire(view, dt, now);
      return;
    }
    const fog = state.name === "fog";
    const cap = fog ? 150 : state.name === "smoke" ? 240 : 420;
    const perSec = fog ? (state.rate / 100) * 24 : state.name === "smoke" ? (state.rate / 100) * 36 : (state.rate / 100) * 110;
    if (fog && state.parts.length === 0) {
      for (let i = 0; i < 80; i++) state.parts.push(spawnFog(view.w, view.h));
    }
    state.acc += dt * perSec;
    while (state.acc >= 1 && state.parts.length < cap) {
      state.acc -= 1;
      state.parts.push(fog ? spawnFog(view.w, view.h) : state.name === "smoke" ? spawnSmoke(view.w, view.h) : spawnSnow(view.w));
    }
    if (state.name === "smoke" || fog) drawSmoke(view, dt);
    else drawSnow(view, dt, now);
  }

  function flameSeeds(w) {
    if (state.flames && state.flameW === w) return state.flames;
    const list = [];
    function add(mix, width, lean) {
      list.push({
        x: Math.random() * w,
        mix: mix,
        phase: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 2.2,
        width: width,
        lean: lean
      });
    }
    for (let n = 0; n < 5; n++) add(0.72 + Math.random() * 0.4, 0.35 + Math.random() * 0.35, (Math.random() - 0.5) * 0.35);
    for (let n = 0; n < 4; n++) add(0.4 + Math.random() * 0.22, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.2);
    for (let n = 0; n < 7; n++) add(0.12 + Math.random() * 0.2, 0.45 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15);
    state.flames = list;
    state.flameW = w;
    return list;
  }

  function tongue(ctx, x, base, height, half, lean, hot) {
    const top = base - height;
    const tipX = x + lean * height;
    const paint = ctx.createLinearGradient(x, base, tipX, top);
    if (hot) {
      paint.addColorStop(0, "rgba(255, 90, 16, 0.55)");
      paint.addColorStop(0.45, "rgba(90, 8, 0, 0.25)");
      paint.addColorStop(1, "rgba(0, 0, 0, 0)");
    } else {
      paint.addColorStop(0, "rgba(70, 8, 0, 0.9)");
      paint.addColorStop(0.4, "rgba(28, 2, 0, 0.65)");
      paint.addColorStop(0.75, "rgba(0, 0, 0, 0.4)");
      paint.addColorStop(1, "rgba(0, 0, 0, 0)");
    }
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.moveTo(x - half, base + 2);
    ctx.bezierCurveTo(x - half * 0.85, base - height * 0.08, tipX - half * 0.04, top + height * 0.28, tipX, top);
    ctx.bezierCurveTo(tipX + half * 0.04, top + height * 0.28, x + half * 0.85, base - height * 0.08, x + half, base + 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawFlames(view, now) {
    const ctx = view.ctx;
    const reach = flameReach(view.h);
    const t = now / 1000;
    const tongues = flameSeeds(view.w).slice().sort(function (a, b) { return a.mix - b.mix; });
    for (let i = 0; i < tongues.length; i++) {
      const bit = tongues[i];
      const wave = 0.86 + 0.14 * Math.sin(t * bit.speed + bit.phase);
      const height = reach * bit.mix * wave;
      const half = view.w * 0.045 * bit.width;
      const lean = bit.lean + Math.sin(t * 0.6 + bit.phase) * 0.04;
      tongue(ctx, bit.x, view.h, height, half, lean, false);
      tongue(ctx, bit.x, view.h, height * 0.5, half * 0.22, lean * 0.6, true);
    }
  }

  function drawFire(view, dt, now) {
    const ctx = view.ctx;
    ctx.clearRect(0, 0, view.w, view.h);
    const puff = sprite();
    const next = [];
    for (let i = 0; i < state.parts.length; i++) {
      const bit = state.parts[i];
      if (bit.role !== "smoke") continue;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.ang += bit.spin * dt;
      bit.life -= dt * bit.decay;
      if (bit.life <= 0 || bit.y < -bit.rad) continue;
      next.push(bit);
      const fade = Math.sin(Math.max(0, Math.min(1, bit.life)) * Math.PI);
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.ang);
      ctx.globalAlpha = bit.alpha * fade;
      ctx.drawImage(puff[bit.kind], -bit.rad, -bit.rad, bit.rad * 2, bit.rad * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    drawFlames(view, now);
    for (let i = 0; i < state.parts.length; i++) {
      const bit = state.parts[i];
      if (bit.role !== "spark") continue;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.life -= dt * bit.decay;
      if (bit.life <= 0 || bit.y < -8) continue;
      next.push(bit);
      ctx.globalAlpha = Math.max(0, bit.life);
      ctx.strokeStyle = bit.hot > 0.65 ? "#fff1c4" : "#ff9a2e";
      ctx.lineWidth = bit.rad;
      ctx.beginPath();
      ctx.moveTo(bit.x, bit.y);
      ctx.lineTo(bit.x - bit.vx * 0.03, bit.y - bit.vy * 0.045);
      ctx.stroke();
    }
    state.parts = next;
    ctx.globalAlpha = 1;
  }

  function drawSmoke(view, dt) {
    const ctx = view.ctx;
    ctx.clearRect(0, 0, view.w, view.h);
    const puff = sprite();
    const next = [];
    for (let i = 0; i < state.parts.length; i++) {
      const bit = state.parts[i];
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.ang += bit.spin * dt;
      bit.life -= dt * bit.decay;
      if (bit.life <= 0) continue;
      if (bit.x < -bit.rad) bit.x = view.w + bit.rad;
      if (bit.x > view.w + bit.rad) bit.x = -bit.rad;
      if (state.name === "fog") {
        if (bit.y < -bit.rad) bit.y = view.h + bit.rad;
        if (bit.y > view.h + bit.rad) bit.y = -bit.rad;
      }
      next.push(bit);
      const fade = Math.sin(Math.max(0, Math.min(1, bit.life)) * Math.PI);
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.ang);
      ctx.globalAlpha = bit.alpha * fade;
      const d = bit.rad * 2;
      ctx.drawImage(puff[bit.kind], -bit.rad, -bit.rad, d, d);
      ctx.restore();
    }
    state.parts = next;
    ctx.globalAlpha = 1;
  }

  function drawSnow(view, dt, now) {
    const ctx = view.ctx;
    ctx.clearRect(0, 0, view.w, view.h);
    const t = now / 1000;
    const next = [];
    for (let i = 0; i < state.parts.length; i++) {
      const bit = state.parts[i];
      bit.y += bit.vy * dt;
      bit.sway += dt * 1.3;
      bit.x = bit.home + Math.sin(bit.sway + t) * bit.amp;
      if (bit.y > view.h + 8) continue;
      next.push(bit);
      ctx.globalAlpha = bit.alpha;
      ctx.fillStyle = "#f4f7ff";
      ctx.beginPath();
      ctx.arc(bit.x, bit.y, bit.rad, 0, Math.PI * 2);
      ctx.fill();
    }
    state.parts = next;
    ctx.globalAlpha = 1;
  }

  function stop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.last = 0;
    state.acc = 0;
    state.hazeAcc = 0;
    state.parts = [];
    state.flames = null;
    state.name = "";
    const canvas = state.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.classList.add("hidden");
  }

  function sync(canvas, spec) {
    state.canvas = canvas;
    if (!canvas) return;
    const name = spec && (spec.name === "smoke" || spec.name === "snow" || spec.name === "fire" || spec.name === "fog") ? spec.name : "";
    if (!name) {
      stop();
      return;
    }
    canvas.classList.remove("hidden");
    if (state.name !== name) {
      state.parts = [];
      state.flames = null;
      state.acc = 0;
      state.hazeAcc = 0;
      const ctx = canvas.getContext("2d");
      if (ctx && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    state.name = name;
    state.rate = clamp(spec.rate, name === "snow" ? 46 : name === "fire" ? 64 : name === "fog" ? 88 : 78);
    state.size = clamp(spec.size, name === "snow" ? 40 : name === "fire" ? 58 : name === "fog" ? 84 : 76);
    if (!state.raf) state.raf = requestAnimationFrame(step);
  }

  window.ShirmoFx = { sync: sync };
})();
