(function () {
  const PHI = (1 + Math.sqrt(5)) / 2;

  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  function quat(x, y, z, w) { return [x, y, z, w]; }

  function qmul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  }

  function qaxis(axis, angle) {
    const h = angle * 0.5;
    const s = Math.sin(h);
    const n = norm(axis);
    return quat(n[0] * s, n[1] * s, n[2] * s, Math.cos(h));
  }

  function qrot(q, v) {
    const u = [q[0], q[1], q[2]];
    const s = q[3];
    const uv = cross(u, v);
    const uuv = cross(u, uv);
    return [
      v[0] + 2 * (s * uv[0] + uuv[0]),
      v[1] + 2 * (s * uv[1] + uuv[1]),
      v[2] + 2 * (s * uv[2] + uuv[2])
    ];
  }

  function qalign(from, to) {
    const a = norm(from);
    const b = norm(to);
    const d = dot(a, b);
    if (d > 0.9999) return quat(0, 0, 0, 1);
    if (d < -0.9999) {
      const axis = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
      return qaxis(axis, Math.PI);
    }
    const c = cross(a, b);
    return norm4([c[0], c[1], c[2], 1 + d]);
  }

  function norm4(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }

  function build() {
    const raw = [
      [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
      [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
      [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
    ].map(norm);
    let min = Infinity;
    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) min = Math.min(min, dist(raw[i], raw[j]));
    }
    const faces = [];
    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) {
        if (Math.abs(dist(raw[i], raw[j]) - min) > 1e-4) continue;
        for (let k = j + 1; k < raw.length; k++) {
          if (Math.abs(dist(raw[j], raw[k]) - min) > 1e-4) continue;
          if (Math.abs(dist(raw[k], raw[i]) - min) > 1e-4) continue;
          faces.push([i, j, k]);
        }
      }
    }
    faces.forEach(function (face) {
      const a = raw[face[0]];
      const b = raw[face[1]];
      const c = raw[face[2]];
      const n = cross(sub(b, a), sub(c, a));
      const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (dot(n, mid) < 0) {
        const swap = face[1];
        face[1] = face[2];
        face[2] = swap;
      }
    });
    return { verts: raw, faces: faces };
  }

  const DIE = build();

  function faceNormal(verts, face) {
    return norm(cross(sub(verts[face[1]], verts[face[0]]), sub(verts[face[2]], verts[face[0]])));
  }

  let frame = 0;

  function play(canvas, die, stage) {
    cancelAnimationFrame(frame);
    const result = Math.min(20, Math.max(1, Number(die.result) || 1));
    const face = result - 1;
    const width = stage.width || canvas.width || 1368;
    const height = stage.height || canvas.height || 786;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const normal = faceNormal(DIE.verts, DIE.faces[face]);
    const align = qalign(normal, [0, 0, 1]);
    const spinAxis = norm([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]);
    const duration = Math.min(6000, Math.max(400, Number(die.ms) || 2300));
    const spinTurns = Math.max(1.4, duration / 380);
    const started = performance.now();

    function draw(now) {
      const t = Math.min(1, (now - started) / duration);
      const decay = Math.pow(1 - t, 1.7);
      const spin = qaxis(spinAxis, spinTurns * Math.PI * 2 * decay);
      const q = qmul(spin, align);
      const rotated = DIE.verts.map(function (v) { return qrot(q, v); });
      const cx = width * 0.5;
      const cy = height * 0.42 - Math.sin(t * Math.PI) * (1 - t) * 70;
      const scale = Math.min(width, height) * 0.22;
      const cam = 3.1;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      const shadow = 1 - decay * 0.35;
      ctx.ellipse(cx, height * 0.42 + scale * 1.15, scale * 0.85 * shadow, scale * 0.22 * shadow, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fill();

      const drawn = DIE.faces.map(function (f, index) {
        const n = faceNormal(rotated, f);
        const z = (rotated[f[0]][2] + rotated[f[1]][2] + rotated[f[2]][2]) / 3;
        return { index: index, n: n, z: z, f: f };
      }).sort(function (a, b) { return a.z - b.z; });

      drawn.forEach(function (item) {
        if (item.n[2] < -0.05) return;
        const pts = item.f.map(function (index) {
          const v = rotated[index];
          const p = cam / (cam - v[2]);
          return [cx + v[0] * p * scale, cy - v[1] * p * scale];
        });
        const light = Math.max(0, item.n[2]);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath();
        const tone = Math.round(22 + light * 58);
        ctx.fillStyle = "rgb(" + (tone + 18) + "," + (tone + 8) + "," + tone + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(215,181,109," + (0.35 + light * 0.6) + ")";
        ctx.lineWidth = 2;
        ctx.stroke();
        if (item.n[2] > 0.42) {
          const mx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
          const my = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
          const size = 18 + light * (item.index === face ? 28 : 16);
          ctx.fillStyle = item.index === face && t > 0.82 ? "#f3e2b0" : "#e7c98a";
          ctx.font = "600 " + Math.round(size) + "px Georgia, serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(item.index + 1), mx, my);
        }
      });

      if (die.label) {
        ctx.fillStyle = "#f4efe6";
        ctx.font = "500 28px Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(die.label, cx, cy + scale * 1.55);
      }
      ctx.restore();

      if (t < 1) frame = requestAnimationFrame(draw);
      else {
        setTimeout(function () {
          if (canvas.dataset.played === String(die.id)) ctx.clearRect(0, 0, width, height);
        }, 1400);
      }
    }

    draw(performance.now());
  }

  function sync(canvas, die, stage) {
    if (!canvas || !die || !die.id) return;
    if (canvas.dataset.played === String(die.id)) return;
    const age = Date.now() - (Number(die.at) || 0);
    if (age > 8000) {
      canvas.dataset.played = String(die.id);
      return;
    }
    canvas.dataset.played = String(die.id);
    play(canvas, die, stage || { width: canvas.width, height: canvas.height });
  }

  window.ShirmoDice = { sync: sync, faces: DIE.faces.length };
})();
