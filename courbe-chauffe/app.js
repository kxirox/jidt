(function () {
  'use strict';
  var VERSION = 'v9';
  /* Toute erreur JS est affichée à l'écran au lieu de laisser une page vide */
  window.addEventListener('error', function (e) {
    var b = document.getElementById('err'), t = document.getElementById('errTxt');
    if (b && t) { t.textContent = 'Erreur : ' + (e.message || 'inconnue') + ' (' + VERSION + ')'; b.hidden = false; }
  });
  var M = window.Chauffe;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (v, d) { return v.toLocaleString('fr-FR', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DEFAULTS = { mode: 'calib', curve: 'lin', adj: null, padj: null, two: false, pTe2: -5, pTf2: 50, tmax: null, tmin: null, pTe: 15, pTf: 27, pTi: 20, regime: '70,55', emitter: '1.3', n: 1.3, Te0: -7, Ti: 20, Te: -7, revTf: '' };
  var S = Object.assign({}, DEFAULTS);
  var REGIMES = ['90,70', '80,60', '70,55', '55,45', '45,35', '35,28'];
  try { Object.assign(S, JSON.parse(localStorage.getItem('chauffe') || '{}')); } catch (e) {}
  /* Réparation d'un état enregistré par une ancienne version ou corrompu */
  Object.keys(DEFAULTS).forEach(function (k) {
    var d = DEFAULTS[k], v = S[k];
    if (typeof d === 'number' && !(typeof v === 'number' && isFinite(v))) S[k] = d;
    if (k === 'adj' || k === 'padj' || k === 'tmax' || k === 'tmin') S[k] = (typeof v === 'number' && isFinite(v)) ? v : null;
  });
  if (REGIMES.indexOf(S.regime) < 0) S.regime = DEFAULTS.regime;
  if (S.curve !== 'lin' && S.curve !== 'exp') S.curve = 'lin';
  if (S.mode !== 'calib' && S.mode !== 'ideal') S.mode = 'calib';
  S.two = !!S.two;
  function save() { try { localStorage.setItem('chauffe', JSON.stringify(S)); } catch (e) {} }

  /* ---------- Calcul : paramètres cibles ---------- */
  var last = null;
  function compute() {
    var lin = S.curve === 'lin' ? 1 : 0, two = lin && S.two && S.mode === 'calib';
    var nom, slope, par0 = 0, err = null, ref = null;
    if (S.mode === 'calib') {
      nom = M.calibrate({ Te: S.pTe, Tf: S.pTf, Ti: S.pTi }, { Te0: S.Te0, n: S.n, Tf0: 70, Tr0: 55 });
      if (!nom) err = "L'ext. du point doit être inférieure à l'ambiance de ce point.";
      else if (two) {
        if (Math.abs(S.pTe2 - S.pTe) < 0.01) err = 'Les deux points doivent avoir des ext. différentes.';
        else {
          slope = (S.pTf - S.pTf2) / (S.pTe2 - S.pTe);
          if (slope <= 0) err = 'Le départ doit augmenter quand l\'ext. baisse.';
          else par0 = S.pTf - S.pTi - slope * (S.pTi - S.pTe);
        }
      } else slope = M.slopeOf({ Te: S.pTe, Tf: S.pTf, Ti: S.pTi });
    } else {
      var r = S.regime.split(',').map(Number);
      nom = { Te0: S.Te0, n: S.n, Tf0: r[0], Tr0: r[1] };
      slope = (r[0] - M.TI_DESIGN) / (M.TI_DESIGN - S.Te0);
    }
    if (err) return { err: err, prev: last };
    var eff = lin && S.adj != null ? S.adj : slope, ePar = lin && S.padj != null ? S.padj : par0;
    var lim = { tmax: S.tmax, tmin: S.tmin };
    var p = { Ti: S.Ti, Te0: nom.Te0, n: nom.n, Tf0: nom.Tf0, Tr0: nom.Tr0, s: eff, par: ePar, lin: lin, tmax: lim.tmax, tmin: lim.tmin };
    if (S.mode === 'calib' || eff !== slope || ePar !== par0) ref = { Ti: S.mode === 'calib' ? S.pTi : S.Ti, Te0: nom.Te0, n: nom.n, Tf0: nom.Tf0, Tr0: nom.Tr0, s: slope, par: par0, lin: lin, tmax: lim.tmax, tmin: lim.tmin };
    last = { p: p, ref: ref, nom: nom, slope: eff, base: slope, par: ePar, base0: par0, lin: lin, two: two };
    return last;
  }

  /* ---------- État animé (lissage exponentiel) ---------- */
  var disp = null;
  function target(c) {
    var o = { Ti: c.p.Ti, Te0: c.p.Te0, n: c.p.n, Tf0: c.p.Tf0, Tr0: c.p.Tr0, s: c.p.s, par: c.p.par, lin: c.p.lin, tmax: c.p.tmax != null ? c.p.tmax : 1000, tmin: c.p.tmin != null ? c.p.tmin : -1000, Te: S.Te,
      showRef: c.ref && (Math.abs(c.ref.Ti - c.p.Ti) > 0.01 || (c.lin && (Math.abs(c.ref.s - c.p.s) > 0.001 || Math.abs(c.ref.par - c.p.par) > 0.001))) ? 1 : 0 };
    if (c.ref) { o.rTi = c.ref.Ti; o.rTf0 = c.ref.Tf0; o.rTr0 = c.ref.Tr0; o.rs = c.ref.s; o.rpar = c.ref.par; }
    else { o.rTi = o.Ti; o.rTf0 = o.Tf0; o.rTr0 = o.Tr0; o.rs = o.s; o.rpar = o.par; }
    if (S.mode === 'calib') { o.px = S.pTe; o.py = S.pTf; o.pOn = 1; o.p2On = c.two ? 1 : 0; o.px2 = S.pTe2; o.py2 = S.pTf2; } else { o.px = 15; o.py = 30; o.pOn = 0; o.p2On = 0; o.px2 = -5; o.py2 = 50; }
    return o;
  }
  var tgt = null;
  function step(dt) {
    var k = reduced ? 1 : 1 - Math.exp(-dt * 7), settled = true;
    for (var key in tgt) {
      var d = tgt[key] - disp[key];
      if (Math.abs(d) > 1e-4) { disp[key] += d * k; settled = false; } else disp[key] = tgt[key];
    }
    return settled;
  }
  function pOf(d, ref) { return ref ? { Ti: d.rTi, Te0: d.Te0, n: d.n, Tf0: d.rTf0, Tr0: d.rTr0, s: d.rs, par: d.rpar, lin: d.lin, tmax: d.tmax, tmin: d.tmin } : d; }

  /* ---------- Rendu du graphique ---------- */
  var cv = $('chart'), ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1;
  var pad = { l: 44, r: 16, t: 14, b: 44 };
  function resize() {
    dpr = window.devicePixelRatio || 1;
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  var particles = [];
  for (var i = 0; i < 16; i++) particles.push({ t: i / 16, dir: 1 }), particles.push({ t: (i + .5) / 16, dir: -1 });

  function draw(time) {
    var d = disp, p = pOf(d, false);
    var xL = Math.max(22, Math.ceil(d.Ti + 1)), xR = Math.min(-15, Math.floor(d.Te0 - 6));
    var top = M.curve(p, xR).Tf, yMin = Math.floor((Math.min(d.Ti, 15) - 2) / 5) * 5;
    var yMax = Math.max(60, Math.ceil((top + 3) / 10) * 10);
    var X = function (te) { return pad.l + (xL - te) / (xL - xR) * (W - pad.l - pad.r); };
    var Y = function (t) { return H - pad.b - (t - yMin) / (yMax - yMin) * (H - pad.t - pad.b); };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px system-ui,sans-serif';

    // grille + axes
    ctx.lineWidth = 1; ctx.fillStyle = '#8d9ab8'; ctx.strokeStyle = '#2a3554';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var y = yMin; y <= yMax; y += 10) { ctx.beginPath(); ctx.moveTo(pad.l, Y(y)); ctx.lineTo(W - pad.r, Y(y)); ctx.stroke(); ctx.fillText(y, pad.l - 8, Y(y)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var xs = (xL - xR) > 30 ? 5 : 2;
    for (var x = Math.floor(xL / xs) * xs; x >= xR; x -= xs) { if (x > xL) continue; ctx.beginPath(); ctx.moveTo(X(x), pad.t); ctx.lineTo(X(x), H - pad.b); ctx.globalAlpha = .45; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(x, X(x), H - pad.b + 8); }
    ctx.textBaseline = 'bottom'; ctx.fillText('Température extérieure (°C)', pad.l + (W - pad.l - pad.r) / 2, H - 3); ctx.textBaseline = 'top';
    ctx.save(); ctx.translate(12, pad.t + (H - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('Départ (°C)', 0, 0); ctx.restore();

    function line(pp, key) {
      ctx.beginPath();
      for (var i = 0; i <= 90; i++) {
        var te = xL + (xR - xL) * i / 90, v = M.curve(pp, Math.min(te, 1e9))[key];
        if (i === 0) ctx.moveTo(X(te), Y(v)); else ctx.lineTo(X(te), Y(v));
      }
    }

    // limites de départ
    ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#ff9b8a'; ctx.strokeStyle = 'rgba(255,155,138,.75)';
    [['maxi', d.tmax], ['mini', d.tmin]].forEach(function (l) {
      if (l[1] > yMin + .5 && l[1] < yMax - .5) { ctx.beginPath(); ctx.moveTo(pad.l, Y(l[1])); ctx.lineTo(W - pad.r, Y(l[1])); ctx.stroke(); ctx.fillText(l[0] + ' ' + fmt(l[1], 0) + ' °C', W - pad.r - 4, Y(l[1]) - 3); }
    });
    ctx.restore();
    // courbe de référence (fantôme)
    if (d.showRef > 0.01) {
      ctx.save(); ctx.globalAlpha = .7 * Math.min(1, d.showRef); ctx.setLineDash([2, 6]); ctx.lineWidth = 2; ctx.strokeStyle = '#8d9ab8'; ctx.lineCap = 'round';
      line(pOf(d, true), 'Tf'); ctx.stroke(); ctx.restore();
    }
    // aire sous le départ
    var g = ctx.createLinearGradient(0, Y(yMax), 0, Y(yMin));
    g.addColorStop(0, 'rgba(255,122,69,.30)'); g.addColorStop(1, 'rgba(255,122,69,0)');
    line(p, 'Tf'); ctx.lineTo(X(xR), Y(yMin)); ctx.lineTo(X(xL), Y(yMin)); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    // retour
    ctx.save(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#4cc3ff'; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -(time / 40) % 12; ctx.lineCap = 'round';
    line(p, 'Tr'); ctx.stroke(); ctx.restore();
    // départ (halo + trait)
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var lg = ctx.createLinearGradient(X(xL), 0, X(xR), 0); lg.addColorStop(0, '#ffcf6b'); lg.addColorStop(1, '#ff4d3a');
    ctx.strokeStyle = lg; ctx.shadowColor = 'rgba(255,100,60,.8)'; ctx.shadowBlur = 14; ctx.lineWidth = 4; line(p, 'Tf'); ctx.stroke(); ctx.restore();

    // particules d'eau
    if (!reduced) {
      var sp = time / 1000 * 0.07;
      particles.forEach(function (q) {
        var t = ((q.t + sp * q.dir) % 1 + 1) % 1, te = xL + (xR - xL) * t, c = M.curve(p, te);
        ctx.beginPath(); ctx.arc(X(te), Y(q.dir > 0 ? c.Tf : c.Tr), 2.6, 0, 7);
        ctx.fillStyle = q.dir > 0 ? 'rgba(255,240,200,.9)' : 'rgba(210,240,255,.85)'; ctx.fill();
      });
    }

    // point de référence (calage)
    var pulse = reduced ? 0 : (Math.sin(time / 350) + 1) / 2;
    if (d.pOn > 0.01 && d.px < xL && d.px > xR - 1) {
      ctx.globalAlpha = d.pOn; ctx.beginPath(); ctx.arc(X(d.px), Y(d.py), 6 + pulse * 5, 0, 7); ctx.strokeStyle = 'rgba(255,179,71,' + (0.8 - pulse * .5) + ')'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(X(d.px), Y(d.py), 5, 0, 7); ctx.fillStyle = '#ffb347'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (d.p2On > 0.01 && d.px2 < xL && d.px2 > xR - 1) {
      ctx.globalAlpha = d.p2On; ctx.beginPath(); ctx.arc(X(d.px2), Y(d.py2), 5, 0, 7); ctx.fillStyle = '#ffb347'; ctx.fill(); ctx.globalAlpha = 1;
    }

    // marqueur de lecture
    var te = Math.min(d.Te, d.Ti), c = M.curve(p, te), mx = X(d.Te), my = Y(c.Tf);
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(232,237,248,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, H - pad.b); ctx.lineTo(mx, my); ctx.lineTo(pad.l, my); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(mx, my, 7 + pulse * 3, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#ff7a45'; ctx.stroke();
    var label = fmt(c.Tf) + ' °C', tw = ctx.measureText(label).width + 16, lx = Math.min(Math.max(mx - tw / 2, pad.l), W - pad.r - tw), ly = my > pad.t + 40 ? my - 34 : my + 14;
    ctx.fillStyle = '#ff7a45'; ctx.beginPath(); ctx.roundRect(lx, ly, tw, 22, 8); ctx.fill();
    ctx.fillStyle = '#1a0f0a'; ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx + tw / 2, ly + 11);
  }

  /* ---------- Boucle d'animation ---------- */
  var prev = 0;
  function frame(t) {
    var dt = Math.min(.1, (t - prev) / 1000 || 0); prev = t;
    if (disp) { try { step(dt); draw(t); } catch (e) { /* une erreur de dessin ne doit pas figer l'app */ } }
    requestAnimationFrame(frame);
  }

  /* ---------- Textes, tableau, résultats ---------- */
  function render() {
    var c = compute(), err = $('info');
    $('err').hidden = !c.err;
    if (c.err) {
      $('errTxt').textContent = c.err; $('rValue').textContent = '–'; $('rLabel').textContent = 'Réglage à corriger';
      if (!disp) {
        var bak = S; S = Object.assign({}, DEFAULTS); var fb = compute(); tgt = target(fb); S = bak;
        disp = Object.assign({}, tgt); disp.Te = S.Te; tgt.Te = S.Te; disp.pOn = tgt.pOn = 0; disp.p2On = tgt.p2On = 0;
      }
      return;
    }
    var p = c.p, r = M.curve(p, Math.min(S.Te, p.Ti));
    $('rLabel').textContent = 'Départ à ' + fmt(S.Te) + ' °C ext.';
    $('rValue').textContent = fmt(r.Tf);
    var sub = 'Retour ' + fmt(r.Tr) + ' °C · ΔT ' + fmt(r.Tf - r.Tr) + ' K';
    if (S.Te >= p.Ti) sub += ' · pas de besoin de chauffage (départ = ambiance)';
    $('rSub').textContent = sub;
    var h = '';
    if (c.lin) {
      h = 'Droite : départ = ambiance + <b>pente</b> × (ambiance − ext.) + <b>parallèle</b>';
      if (c.two) h += '<br>Déduit de 2 points : pente <b>' + fmt(c.base, 2) + '</b>, parallèle <b>' + (c.base0 >= 0 ? '+' : '') + fmt(c.base0) + ' K</b>.';
      else if (S.mode === 'calib') h += '<br>Passe par ' + fmt(S.pTf) + ' °C à ' + fmt(S.pTe) + ' °C ext. (ambiance ' + fmt(S.pTi) + ' °C).';
    } else {
      h = 'Régime déduit : <b>' + fmt(c.nom.Tf0) + ' / ' + fmt(c.nom.Tr0) + ' °C</b> à ' + fmt(c.nom.Te0, 0) + ' °C ext.';
    }
    if (c.ref) {
      var rr = M.curve(c.ref, Math.min(S.Te, c.ref.Ti)).Tf, dd = r.Tf - rr;
      if (Math.abs(dd) > .005) h += '<br>Courbe d\'origine : <b>' + fmt(rr) + ' °C</b> à cet ext. ; écart : <b>' + (dd >= 0 ? '+' : '') + fmt(dd) + ' K</b>.';
    }
    [['maxi', p.tmax], ['mini', p.tmin]].forEach(function (l) {
      if (l[1] == null) return;
      var q = Object.assign({}, p, { tmax: null, tmin: null }), te = M.extFor(q, l[1]);
      h += '<br>Départ ' + l[0] + ' ' + fmt(l[1], 0) + ' °C ' + (te == null ? 'non atteint dans la plage.' : 'atteint à ' + fmt(te) + ' °C ext.');
    });
    if (S.mode === 'calib' && S.pTe < S.Te0 - 0.01) h += '<br><span class="warn">Le point est plus froid que l\'ext. de base : extrapolation.</span>';
    var sl = c.lin ? c.slope : M.slopeOf({ Te: p.Te0, Tf: M.curve(p, p.Te0).Tf, Ti: p.Ti });
    $('slopeOut').textContent = fmt(sl, 2); $('slopeLbl').textContent = c.lin ? 'Pente' : 'Pente équivalente';
    $('slopeR').hidden = !c.lin; $('parRow').hidden = !c.lin; $('slopeReset').hidden = !(c.lin && (S.adj != null || S.padj != null));
    $('parOut').textContent = (c.par > 0 ? '+' : '') + fmt(c.par);
    if (document.activeElement !== $('parR')) $('parR').value = c.par;
    if (document.activeElement !== $('slopeR')) $('slopeR').value = sl;
    err.innerHTML = h;
    var rows = '', pts = [20, 15, 10, 5, 0, -5, -10, -15].filter(function (v) { return v > S.Te0 - 9; });
    if (pts.indexOf(S.Te0) < 0 && S.Te0 > -15) { pts.push(S.Te0); pts.sort(function (a, b) { return b - a; }); }
    pts.forEach(function (te) {
      var v = M.curve(p, Math.min(te, p.Ti));
      rows += '<tr' + (te === S.Te0 ? ' class="hl"' : '') + '><td>' + te + ' °C' + (te === S.Te0 ? ' (base)' : '') + '</td><td>' + fmt(v.Tf) + ' °C</td><td>' + fmt(v.Tr) + ' °C</td></tr>';
    });
    $('tbody').innerHTML = rows;
    revCalc(p);
    tgt = target(c); if (!disp) disp = Object.assign({}, tgt);
    if (disp.tmax > 500 && tgt.tmax < 500) disp.tmax = tgt.tmax + 15;
    if (disp.tmin < -500 && tgt.tmin > -500) disp.tmin = tgt.tmin - 15;
    $('legRef').hidden = !tgt.showRef;
  }
  function revCalc(p) {
    var v = parseFloat(S.revTf), o = $('revOut');
    if (isNaN(v)) { o.textContent = ''; return; }
    var te = M.extFor(p, v);
    o.textContent = te == null ? 'Hors plage de la courbe.' : 'Un départ de ' + fmt(v) + ' °C correspond à ' + fmt(te) + ' °C ext.';
  }

  /* ---------- Formulaire ---------- */
  var numFields = ['pTe', 'pTf', 'pTi', 'pTe2', 'pTf2', 'n', 'Te0', 'Ti', 'Te'];
  function resetAdj() { S.adj = null; S.padj = null; }
  function sync() {
    numFields.forEach(function (k) { if (document.activeElement !== $(k)) $(k).value = S[k]; });
    $('curve').value = S.curve; $('emitRow').hidden = S.curve === 'lin';
    var cal = S.mode === 'calib';
    $('pTiBox').hidden = !cal;
    var two = cal && S.curve === 'lin' && S.two;
    $('pt2Row').hidden = !two; $('toggle2').hidden = !(cal && S.curve === 'lin');
    $('toggle2').textContent = S.two ? '− Un seul point (pente seule)' : '+ 2ᵉ point : pente et parallèle';
    ['tmax', 'tmin'].forEach(function (k) { if (document.activeElement !== $(k)) $(k).value = S[k] == null ? '' : S[k]; });
    $('revTf').value = S.revTf; $('regime').value = S.regime; $('emitter').value = S.emitter;
    $('teOut').textContent = fmt(S.Te);
    $('calibBox').hidden = !cal; $('idealBox').hidden = cal;
  }
  function update() { save(); sync(); render(); }
  numFields.forEach(function (k) {
    $(k).addEventListener('input', function () {
      var v = parseFloat($(k).value.replace(',', '.'));
      if (!isNaN(v)) { S[k] = v; if (k === 'pTe' || k === 'pTf' || k === 'pTi' || k === 'pTe2' || k === 'pTf2' || k === 'Te0' || k === 'n') resetAdj(); if (k === 'n') { var m = ['1.1', '1.3', '1.4'].indexOf(String(v)); S.emitter = m < 0 ? 'custom' : String(v); } update(); }
    });
  });
  $('revTf').addEventListener('input', function () { S.revTf = $('revTf').value; save(); if (last) revCalc(last.p); });
  $('curve').addEventListener('change', function () { S.curve = $('curve').value; resetAdj(); update(); });
  $('slopeR').addEventListener('input', function () { S.adj = parseFloat($('slopeR').value); if (last && Math.abs(S.adj - last.base) < 0.001) S.adj = null; update(); });
  $('parR').addEventListener('input', function () { S.padj = parseFloat($('parR').value); if (last && Math.abs(S.padj - last.base0) < 0.001) S.padj = null; update(); });
  $('slopeReset').onclick = function () { resetAdj(); update(); };
  $('toggle2').onclick = function () { S.two = !S.two; resetAdj(); update(); };
  ['tmax', 'tmin'].forEach(function (k) {
    $(k).addEventListener('input', function () { var v = parseFloat($(k).value.replace(',', '.')); S[k] = isNaN(v) ? null : v; update(); });
  });
  $('regime').addEventListener('change', function () { S.regime = $('regime').value; resetAdj(); update(); });
  $('emitter').addEventListener('change', function () {
    S.emitter = $('emitter').value; if (S.emitter !== 'custom') S.n = parseFloat(S.emitter); update();
  });
  $('errReset').onclick = function () { try { localStorage.removeItem('chauffe'); } catch (e) {} S = Object.assign({}, DEFAULTS); last = null; disp = null; update(); };
  $('toCalib').onclick = function () { S.mode = 'calib'; resetAdj(); update(); };
  $('toIdeal').onclick = function () { S.mode = 'ideal'; resetAdj(); update(); };

  // Lecture au doigt / à la souris sur le graphique
  function pick(e) {
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    var d = disp, xL = Math.max(22, Math.ceil(d.Ti + 1)), xR = Math.min(-15, Math.floor(d.Te0 - 6));
    var te = xL - (x - pad.l) / (W - pad.l - pad.r) * (xL - xR);
    S.Te = Math.round(Math.max(-20, Math.min(25, te)) * 2) / 2; update();
  }
  var down = false;
  cv.addEventListener('pointerdown', function (e) { down = true; cv.setPointerCapture(e.pointerId); pick(e); });
  cv.addEventListener('pointermove', function (e) { if (down) pick(e); });
  cv.addEventListener('pointerup', function () { down = false; });
  cv.addEventListener('pointercancel', function () { down = false; });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);

  /* ---------- PWA ---------- */
  var deferred;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('install').hidden = false; });
  $('install').onclick = function () { if (deferred) { deferred.prompt(); deferred = null; $('install').hidden = true; } };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});

  var vEl = document.getElementById('ver'); if (vEl) vEl.textContent = VERSION;
  resize();
  try { update(); } catch (e) {
    /* état enregistré inutilisable : on repart de zéro une fois */
    try { localStorage.removeItem('chauffe'); } catch (x) {}
    S = Object.assign({}, DEFAULTS); last = null; disp = null; update();
  }
  requestAnimationFrame(frame);
})();
