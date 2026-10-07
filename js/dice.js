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

  function fitVerts(verts) {
    let max = 0;
    verts.forEach(function (v) { max = Math.max(max, Math.hypot(v[0], v[1], v[2])); });
    const scale = 0.92 / (max || 1);
    return verts.map(function (v) { return [v[0] * scale, v[1] * scale, v[2] * scale]; });
  }

  function fixWinding(verts, faces) {
    const mid = [0, 0, 0];
    verts.forEach(function (v) { mid[0] += v[0]; mid[1] += v[1]; mid[2] += v[2]; });
    mid[0] /= verts.length;
    mid[1] /= verts.length;
    mid[2] /= verts.length;
    faces.forEach(function (face) {
      const a = verts[face[0]];
      const b = verts[face[1]];
      const c = verts[face[2]];
      const n = cross(sub(b, a), sub(c, a));
      const center = [0, 0, 0];
      face.forEach(function (index) {
        center[0] += verts[index][0];
        center[1] += verts[index][1];
        center[2] += verts[index][2];
      });
      center[0] /= face.length;
      center[1] /= face.length;
      center[2] /= face.length;
      if (dot(n, sub(center, mid)) < 0) face.reverse();
    });
    return { verts: verts, faces: faces };
  }

  function meshD4() {
    const verts = fitVerts([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]);
    return fixWinding(verts, [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]]);
  }

  function meshD6() {
    const s = 1;
    const verts = fitVerts([
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]
    ]);
    return fixWinding(verts, [
      [4, 5, 6, 7],
      [1, 0, 3, 2],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [0, 4, 7, 3]
    ]);
  }

  function meshD8() {
    const verts = fitVerts([[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]);
    return fixWinding(verts, [
      [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
      [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]
    ]);
  }

  function meshD10() {
    const verts = [[0, 1.15, 0], [0, -1.15, 0]];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      verts.push([Math.cos(angle), 0, Math.sin(angle)]);
    }
    const faces = [];
    for (let i = 0; i < 5; i++) {
      const a = 2 + i;
      const b = 2 + (i + 1) % 5;
      faces.push([0, a, b]);
      faces.push([1, b, a]);
    }
    return fixWinding(fitVerts(verts), faces);
  }

  function meshD12() {
    const centers = DIE.faces.map(function (face) {
      const a = DIE.verts[face[0]];
      const b = DIE.verts[face[1]];
      const c = DIE.verts[face[2]];
      return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    });
    const faces = [];
    for (let vertex = 0; vertex < DIE.verts.length; vertex++) {
      const around = [];
      DIE.faces.forEach(function (face, index) {
        if (face[0] === vertex || face[1] === vertex || face[2] === vertex) around.push(index);
      });
      if (!around.length) continue;
      const ordered = [around[0]];
      const used = {};
      used[around[0]] = true;
      while (ordered.length < around.length) {
        const last = DIE.faces[ordered[ordered.length - 1]];
        let next = -1;
        for (let i = 0; i < around.length; i++) {
          const cand = around[i];
          if (used[cand]) continue;
          const other = DIE.faces[cand];
          let share = 0;
          last.forEach(function (index) { if (other.indexOf(index) >= 0) share++; });
          if (share >= 2) { next = cand; break; }
        }
        if (next < 0) break;
        used[next] = true;
        ordered.push(next);
      }
      if (ordered.length >= 3) faces.push(ordered);
    }
    return fixWinding(fitVerts(centers), faces);
  }

  const MESH = {
    4: meshD4(),
    6: meshD6(),
    8: meshD8(),
    10: meshD10(),
    12: meshD12(),
    20: DIE
  };

  function meshFor(sides) {
    if (MESH[sides]) return MESH[sides];
    if (sides <= 4) return MESH[4];
    if (sides <= 6) return MESH[6];
    if (sides <= 8) return MESH[8];
    if (sides <= 10) return MESH[10];
    if (sides <= 12) return MESH[12];
    return MESH[20];
  }

  function faceNormal(verts, face) {
    return norm(cross(sub(verts[face[1]], verts[face[0]]), sub(verts[face[2]], verts[face[0]])));
  }

  let frame = 0;

  function play(canvas, die, stage) {
    cancelAnimationFrame(frame);
    const list = (die.dice && die.dice.length ? die.dice : [{ sides: 20, value: Math.min(20, Math.max(1, Number(die.result) || 1)), sign: 1 }]).map(function (item, index) {
      const sides = Math.min(100, Math.max(2, Number(item.sides) || 20));
      const mesh = meshFor(sides);
      const value = Math.min(sides, Math.max(1, Number(item.value) || 1));
      let tint = item.tint === "advantage" || item.tint === "disadvantage" ? item.tint : "";
      if (!tint && index > 0 && (die.mode === "advantage" || die.mode === "disadvantage")) tint = die.mode;
      return {
        mesh: mesh,
        sides: sides,
        value: value,
        sign: item.sign < 0 ? -1 : 1,
        tint: tint,
        face: (value - 1) % mesh.faces.length,
        axis: norm([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1])
      };
    });
    const bonus = Number(die.bonus) || 0;
    const total = die.total != null ? die.total : list.reduce(function (sum, item) { return sum + item.sign * item.value; }, 0) + bonus;
    const width = stage.width || canvas.width || 1368;
    const height = stage.height || canvas.height || 786;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const duration = Math.min(6000, Math.max(400, Number(die.ms) || 2300));
    const spinTurns = Math.max(1.4, duration / 380);
    const started = performance.now();
    const count = list.length;
    const base = Math.min(width, height) * (count === 1 ? 0.22 : 0.16);
    let gap = base * 2.4;
    const avail = width * 0.88;
    if (count * gap > avail) gap = avail / count;
    const scale = Math.min(base, gap / 2.4);
    const origin = width * 0.5 - (count - 1) * gap / 2;

    function faceLabel(item, index) {
      if (index === item.face) return item.value;
      if (item.mesh.faces.length === item.sides) return index + 1;
      return (index % item.sides) + 1;
    }

    function draw(now) {
      const t = Math.min(1, (now - started) / duration);
      const decay = Math.pow(1 - t, 1.7);
      const cy = height * 0.42 - Math.sin(t * Math.PI) * (1 - t) * 70;
      const cam = 3.1;
      ctx.clearRect(0, 0, width, height);

      list.forEach(function (item, index) {
        const cx = origin + index * gap;
        const normal = faceNormal(item.mesh.verts, item.mesh.faces[item.face]);
        const align = qalign(normal, [0, 0, 1]);
        const spin = qaxis(item.axis, spinTurns * Math.PI * 2 * decay);
        const q = qmul(spin, align);
        const rotated = item.mesh.verts.map(function (v) { return qrot(q, v); });
        ctx.save();
        ctx.beginPath();
        const shadow = 1 - decay * 0.35;
        ctx.ellipse(cx, height * 0.42 + scale * 1.15, scale * 0.85 * shadow, scale * 0.22 * shadow, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fill();
        const drawn = item.mesh.faces.map(function (face, faceIndex) {
          const n = faceNormal(rotated, face);
          let z = 0;
          face.forEach(function (vi) { z += rotated[vi][2]; });
          return { index: faceIndex, n: n, z: z / face.length, f: face };
        }).sort(function (a, b) { return a.z - b.z; });
        drawn.forEach(function (part) {
          if (part.n[2] < -0.05) return;
          const pts = part.f.map(function (vi) {
            const v = rotated[vi];
            const p = cam / (cam - v[2]);
            return [cx + v[0] * p * scale, cy - v[1] * p * scale];
          });
          const light = Math.max(0, part.n[2]);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
          ctx.closePath();
          let fill;
          let stroke;
          let numeral;
          let edge = 2;
          if (item.tint === "advantage") {
            fill = "rgb(" + Math.round(12 + light * 28) + "," + Math.round(150 + light * 90) + "," + Math.round(48 + light * 55) + ")";
            stroke = "rgba(90, 255, 140, 0.95)";
            numeral = "#e8ffe8";
            edge = 3.5;
          } else if (item.tint === "disadvantage") {
            fill = "rgb(" + Math.round(190 + light * 50) + "," + Math.round(28 + light * 22) + "," + Math.round(22 + light * 18) + ")";
            stroke = "rgba(255, 120, 90, 0.95)";
            numeral = "#ffe8e0";
            edge = 3.5;
          } else {
            const tone = Math.round(22 + light * 58);
            fill = "rgb(" + (tone + 18) + "," + (tone + 8) + "," + tone + ")";
            stroke = "rgba(215,181,109," + (0.35 + light * 0.6) + ")";
            numeral = part.index === item.face && t > 0.82 ? "#f3e2b0" : "#e7c98a";
          }
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = edge;
          ctx.stroke();
          if (part.n[2] > 0.42) {
            let mx = 0;
            let my = 0;
            pts.forEach(function (pt) { mx += pt[0]; my += pt[1]; });
            mx /= pts.length;
            my /= pts.length;
            const size = 16 + light * (part.index === item.face ? 26 : 14);
            ctx.fillStyle = numeral;
            ctx.font = "600 " + Math.round(size * (count === 1 ? 1 : 0.85)) + "px Georgia, serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(faceLabel(item, part.index)), mx, my);
          }
        });
        ctx.restore();
      });

      const showSum = count > 1 || bonus || die.mode === "advantage" || die.mode === "disadvantage";
      let expr = "";
      if (showSum) {
        if (die.mode === "advantage" || die.mode === "disadvantage") {
          expr = list.map(function (item) { return String(item.value); }).join(" · ");
          expr += (die.mode === "advantage" ? " → макс " : " → мин ") + total;
        } else {
          expr = list.map(function (item, index) {
            const n = String(item.value);
            if (index === 0) return item.sign < 0 ? "−" + n : n;
            return (item.sign < 0 ? " − " : " + ") + n;
          }).join("");
          if (bonus) expr += (bonus > 0 ? " + " : " − ") + Math.abs(bonus);
          expr += " = " + total;
        }
      }
      ctx.fillStyle = "#f4efe6";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      let textY = cy + scale * 1.7;
      if (die.label) {
        ctx.font = "500 28px Georgia, serif";
        ctx.fillText(die.label, width * 0.5, textY);
        textY += 36;
      }
      if (expr && t > 0.82) {
        ctx.font = "600 32px Georgia, serif";
        ctx.fillStyle = "#f3e2b0";
        ctx.fillText(expr, width * 0.5, textY);
      }

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
