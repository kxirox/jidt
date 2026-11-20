(function () {
  'use strict';
  var VERSION = 'v16';
  /* Toute erreur JS est affichée à l'écran au lieu de laisser une page vide */
  window.addEventListener('error', function (e) {
    var b = document.getElementById('err'), t = document.getElementById('errTxt');
    if (b && t) { t.textContent = 'Erreur : ' + (e.message || 'inconnue') + ' (' + VERSION + ')'; b.hidden = false; }
  });

  var M = window.Chauffe;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (v, d) { d = d == null ? 1 : d; if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0; return v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var sgn = function (v, d) { return Math.abs(v) < 0.05 ? fmt(0, d) : (v > 0 ? '+' : '−') + fmt(Math.abs(v), d); };
  var r1 = function (v) { return Math.round(v * 10) / 10; }, r2 = function (v) { return Math.round(v * 100) / 100; };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- État ---------- */
  var KEY = 'chauffe2';
  var DEFAULTS = {
    mode: 'pente', s: 1.4, par: 0,
    x1: 20, y1: 20, x2: -5, y2: 55,
    regime: '70,55', expo: false, n: 1.3, emitter: '1.3',
    Tj: 20, Tn: 16, night: false, Tref: 20, Te0: -7,
    tmax: null, tmin: null, Te: -7, revTf: '', ref: null,
    bornes: false, bmin: 3, bmax: 3
  };
  var REGIMES = ['90,70', '80,60', '70,55', '55,45', '45,35', '35,28'];
  var CURVE_KEYS = ['mode', 's', 'par', 'x1', 'y1', 'x2', 'y2', 'regime', 'expo', 'n', 'Tref', 'Te0', 'tmax', 'tmin'];
  var S = Object.assign({}, DEFAULTS);
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  function sanitize(st) {
    Object.keys(DEFAULTS).forEach(function (k) {
      var d = DEFAULTS[k], v = st[k];
      if (typeof d === 'number' && !(typeof v === 'number' && isFinite(v))) st[k] = d;
      if (typeof d === 'boolean') st[k] = !!v;
      if (k === 'tmax' || k === 'tmin') st[k] = (typeof v === 'number' && isFinite(v)) ? v : null;
    });
    if (['pente', 'points', 'ideal'].indexOf(st.mode) < 0) st.mode = 'pente';
    if (REGIMES.indexOf(st.regime) < 0) st.regime = DEFAULTS.regime;
    if (typeof st.revTf !== 'string') st.revTf = '';
    if (typeof st.emitter !== 'string') st.emitter = DEFAULTS.emitter;
    var ok = st.ref && typeof st.ref === 'object' && typeof st.ref.Ti === 'number' && isFinite(st.ref.Ti);
    if (ok) CURVE_KEYS.forEach(function (k) { if (st.ref[k] === undefined) ok = false; });
    if (!ok) st.ref = null;
    return st;
  }
  sanitize(S);
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var tiOf = function (st) { return st.night ? st.Tn : st.Tj; };

  /* ---------- Construction des paramètres du modèle ---------- */
  function buildP(st, Ti) {
    var Tref = st.Tref, Te0 = st.Te0, spread = 15, s, par0, x1, y1, x2, y2;
    if (st.mode === 'points') {
      x1 = st.x1; y1 = st.y1; x2 = st.x2; y2 = st.y2;
      var l = M.lineOf(x1, y1, x2, y2, Tref);
      s = l ? l.s : 0; par0 = l ? l.par0 : 0;
    } else {
      if (st.mode === 'ideal') {
        var r = st.regime.split(',').map(Number);
        s = (r[0] - M.TI_DESIGN) / (M.TI_DESIGN - Te0); par0 = 0; spread = r[0] - r[1];
      } else { s = st.s; par0 = st.par; }
      x1 = Tref; y1 = Tref + par0; x2 = Te0; y2 = Tref + s * (Tref - Te0) + par0;
    }
    return { Ti: Ti, Tref: Tref, lin: st.expo ? 0 : 1, n: st.n, x1: x1, y1: y1, x2: x2, y2: y2, s: s, par0: par0,
      Te0: Te0, spread: spread, tmax: st.tmax, tmin: st.tmin };
  }

  var last = null;
  function compute(st) {
    var Ti = tiOf(st), err = null;
    if (st.mode === 'points') {
      if (Math.abs(st.x1 - st.x2) < 0.01) err = 'Les deux points doivent avoir des ext. différentes.';
      else if ((st.y2 - st.y1) / (st.x1 - st.x2) <= 0) err = 'Le départ doit augmenter quand l\'ext. baisse (vérifie les deux points).';
    } else if (st.mode === 'pente' && st.s <= 0) err = 'La pente doit être positive.';
    if (err) return { err: err };
    var p = buildP(st, Ti), ghost = null, ghostName = '';
    if (st.ref) { ghost = buildP(st.ref, st.ref.Ti); ghostName = 'Référence'; }
    else if (Math.abs(Ti - st.Tref) > 0.01) { ghost = buildP(st, st.Tref); ghostName = 'Courbe à ' + fmt(st.Tref, 0) + ' °C'; }
    return { p: p, ghost: ghost, ghostName: ghostName, Ti: Ti };
  }

  /* ---------- État animé (lissage exponentiel) ---------- */
  var PK = ['Ti', 'Tref', 'lin', 'n', 'x1', 'y1', 'x2', 'y2', 's', 'par0', 'Te0', 'spread', 'tmax', 'tmin'];
  function pack(p) {
    var o = {};
    PK.forEach(function (k) { o[k] = k === 'tmax' ? (p.tmax == null ? 1000 : p.tmax) : k === 'tmin' ? (p.tmin == null ? -1000 : p.tmin) : p[k]; });
    return o;
  }
  function target(c) {
    var o = pack(c.p), g = pack(c.ghost || c.p);
    PK.forEach(function (k) { o['g_' + k] = g[k]; });
    o.showRef = c.ghost ? 1 : 0; o.bOn = S.bornes ? 1 : 0; o.bmin = S.bmin; o.bmax = S.bmax; o.Te = S.Te; o.ptsOn = S.mode === 'points' ? 1 : 0;
    return o;
  }
  var disp = null, tgt = null;
  function step(dt) {
    var k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    for (var key in tgt) {
      var d = tgt[key] - disp[key];
      if (Math.abs(d) > 1e-4) disp[key] += d * k; else disp[key] = tgt[key];
    }
  }
  function pOf(d, ghost) {
    if (!ghost) return d;
    var o = {}; PK.forEach(function (k) { o[k] = d['g_' + k]; }); return o;
  }

  /* ---------- Rendu du graphique ---------- */
  var cv = $('chart'), ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1;
  var pad = { l: 44, r: 16, t: 14, b: 44 };
  var view = null, lockY = null, yMaxS = null;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  var particles = [];
  for (var i = 0; i < 16; i++) particles.push({ t: i / 16, dir: 1 }), particles.push({ t: (i + .5) / 16, dir: -1 });

  function draw(time) {
    var d = disp, p = d, g = pOf(d, true);
    var xL = Math.max(22, Math.ceil(d.Ti + 1), Math.ceil(d.Tref + 1)), xR = Math.min(-15, Math.floor(d.Te0 - 6));
    var top = Math.max(M.curve(p, xR - (d.bOn > .01 ? d.bmin : 0)).Tf, M.curve(p, xR).Tf, d.showRef > .01 ? M.curve(g, xR).Tf : 0);
    var yMin = Math.floor((Math.min(d.Ti, 15) - 2) / 5) * 5;
    var yMaxT = lockY != null ? lockY : Math.max(60, Math.ceil((Math.min(top, 140) + 3) / 10) * 10);
    yMaxS = yMaxS == null || reduced ? yMaxT : yMaxS + (yMaxT - yMaxS) * 0.15;
    if (Math.abs(yMaxS - yMaxT) < 0.05) yMaxS = yMaxT;
    var yMax = yMaxS;
    var X = function (te) { return pad.l + (xL - te) / (xL - xR) * (W - pad.l - pad.r); };
    var Y = function (t) { return H - pad.b - (t - yMin) / (yMax - yMin) * (H - pad.t - pad.b); };
    view = { xL: xL, xR: xR, yMin: yMin, yMax: yMax, X: X, Y: Y };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px system-ui,sans-serif';

    // grille + axes
    ctx.lineWidth = 1; ctx.fillStyle = '#8d9ab8'; ctx.strokeStyle = '#2a3554';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var y = yMin; y <= yMax + 0.01; y += 10) { ctx.beginPath(); ctx.moveTo(pad.l, Y(y)); ctx.lineTo(W - pad.r, Y(y)); ctx.stroke(); ctx.fillText(Math.round(y), pad.l - 8, Y(y)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var xs = (xL - xR) > 30 ? 5 : 2;
    for (var x = Math.floor(xL / xs) * xs; x >= xR; x -= xs) { if (x > xL) continue; ctx.beginPath(); ctx.moveTo(X(x), pad.t); ctx.lineTo(X(x), H - pad.b); ctx.globalAlpha = .45; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(x, X(x), H - pad.b + 8); }
    ctx.textBaseline = 'bottom'; ctx.fillText('Température extérieure (°C)', pad.l + (W - pad.l - pad.r) / 2, H - 3); ctx.textBaseline = 'top';
    ctx.save(); ctx.translate(12, pad.t + (H - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('Départ (°C)', 0, 0); ctx.restore();

    function line(pp, key) {
      ctx.beginPath();
      for (var i = 0; i <= 90; i++) {
        var te = xL + (xR - xL) * i / 90, v = M.curve(pp, te)[key];
        if (i === 0) ctx.moveTo(X(te), Y(v)); else ctx.lineTo(X(te), Y(v));
      }
    }

    // limites de départ
    ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#ff9b8a'; ctx.strokeStyle = 'rgba(255,155,138,.75)';
    [['maxi', d.tmax], ['mini', d.tmin]].forEach(function (l) {
      if (l[1] > yMin + .5 && l[1] < yMax - .5) { ctx.beginPath(); ctx.moveTo(pad.l, Y(l[1])); ctx.lineTo(W - pad.r, Y(l[1])); ctx.stroke(); ctx.fillText(l[0] + ' ' + fmt(l[1], 0) + ' °C', W - pad.r - 4, Y(l[1]) - 3); }
    });
    ctx.restore();
    // bornes : même courbe calculée avec un ext. décalé (mini : ext. − borne, maxi : ext. + borne)
    if (d.bOn > 0.01) {
      var up = [], lo = [], n = 90;
      for (var k = 0; k <= n; k++) { var tk = xL + (xR - xL) * k / n; up.push(M.curve(p, tk - d.bmin).Tf); lo.push(M.curve(p, tk + d.bmax).Tf); }
      ctx.save(); ctx.globalAlpha = Math.min(1, d.bOn);
      ctx.beginPath();
      for (k = 0; k <= n; k++) { var xk = X(xL + (xR - xL) * k / n); if (k === 0) ctx.moveTo(xk, Y(up[k])); else ctx.lineTo(xk, Y(up[k])); }
      for (k = n; k >= 0; k--) ctx.lineTo(X(xL + (xR - xL) * k / n), Y(lo[k]));
      ctx.closePath(); ctx.fillStyle = 'rgba(181,140,255,.13)'; ctx.fill();
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(181,140,255,.9)'; ctx.lineCap = 'round';
      [up, lo].forEach(function (arr) { ctx.beginPath(); for (var k = 0; k <= n; k++) { var xx = X(xL + (xR - xL) * k / n); if (k === 0) ctx.moveTo(xx, Y(arr[k])); else ctx.lineTo(xx, Y(arr[k])); } ctx.stroke(); });
      ctx.setLineDash([]); ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = '#c9aaff'; ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom'; ctx.fillText('borne mini', W - pad.r - 4, Y(up[n]) - 4);
      ctx.textBaseline = 'top'; ctx.fillText('borne maxi', W - pad.r - 4, Y(lo[n]) + 4);
      ctx.restore();
    }
    // courbe de référence (fantôme)
    if (d.showRef > 0.01) {
      ctx.save(); ctx.globalAlpha = .75 * Math.min(1, d.showRef); ctx.setLineDash([2, 6]); ctx.lineWidth = 2; ctx.strokeStyle = '#8d9ab8'; ctx.lineCap = 'round';
      line(g, 'Tf'); ctx.stroke(); ctx.restore();
    }
    // aire sous le départ
    var gr = ctx.createLinearGradient(0, Y(yMax), 0, Y(yMin));
    gr.addColorStop(0, 'rgba(255,122,69,.30)'); gr.addColorStop(1, 'rgba(255,122,69,0)');
    line(p, 'Tf'); ctx.lineTo(X(xR), Y(yMin)); ctx.lineTo(X(xL), Y(yMin)); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
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

    var pulse = reduced ? 0 : (Math.sin(time / 350) + 1) / 2;
    // les deux points de saisie (mode « 2 points »), déplaçables
    if (d.ptsOn > 0.01) {
      [[d.x1, d.y1, '1'], [d.x2, d.y2, '2']].forEach(function (a) {
        var ax = X(a[0]), ay = Y(a[1]);
        ctx.globalAlpha = d.ptsOn;
        ctx.beginPath(); ctx.arc(ax, ay, 9 + pulse * 3, 0, 7); ctx.strokeStyle = 'rgba(255,179,71,' + (0.75 - pulse * .4) + ')'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 8, 0, 7); ctx.fillStyle = '#ffb347'; ctx.fill();
        ctx.fillStyle = '#1a0f0a'; ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a[2], ax, ay + 0.5);
        ctx.globalAlpha = 1;
      });
    }

    // marqueur de lecture
    var te = d.Te, c = M.curve(p, te), mx = X(te), my = Y(c.Tf);
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(232,237,248,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, H - pad.b); ctx.lineTo(mx, my); ctx.lineTo(pad.l, my); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(mx, my, 7 + pulse * 3, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#ff7a45'; ctx.stroke();
    var label = fmt(c.Tf) + ' °C', tw;
    ctx.font = 'bold 12px system-ui,sans-serif'; tw = ctx.measureText(label).width + 16;
    var lx = Math.min(Math.max(mx - tw / 2, pad.l), W - pad.r - tw), ly = my > pad.t + 40 ? my - 34 : my + 14;
    ctx.fillStyle = '#ff7a45'; ctx.beginPath(); ctx.roundRect(lx, ly, tw, 22, 8); ctx.fill();
    ctx.fillStyle = '#1a0f0a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx + tw / 2, ly + 11);
  }

  /* ---------- Boucle d'animation ---------- */
  var prev = 0;
  function frame(t) {
    var dt = Math.min(.1, (t - prev) / 1000 || 0); prev = t;
    if (disp) { try { step(dt); draw(t); } catch (e) { /* une erreur de dessin ne doit pas figer l'app */ } }
    requestAnimationFrame(frame);
  }

  /* ---------- Textes, tableau, résultats ---------- */
  var N = function (v) { return v < 0 ? '(' + fmt(v, 1) + ')' : fmt(v, 1); };
  function render() {
    var c = compute(S);
    $('err').hidden = !c.err;
    if (c.err) {
      $('errTxt').textContent = c.err; $('rValue').textContent = '–'; $('rRet').innerHTML = ''; $('rLabel').textContent = 'Réglage à corriger';
      $('eqLine').textContent = '';
      if (!disp) {
        var fb = compute(DEFAULTS); tgt = target(fb); disp = Object.assign({}, tgt); disp.Te = S.Te; tgt.Te = S.Te;
      }
      return;
    }
    last = c;
    var p = c.p, r = M.curve(p, S.Te);
    $('rLabel').textContent = 'Départ à ' + fmt(S.Te) + ' °C ext.' + (S.night ? ' · nuit' : '');
    $('rValue').textContent = fmt(r.Tf);
    $('rRet').innerHTML = '<small>Retour</small>' + fmt(r.Tr) + ' °C';
    $('rSub').textContent = 'Retour ' + fmt(r.Tr) + ' °C · ΔT ' + fmt(r.Tf - r.Tr) + ' K' + (S.Te >= p.Ti ? ' · pas de besoin de chauffage' : '');

    // équivalences (visibles sous la saisie)
    var pr = Object.assign({}, p, { Ti: S.Tref }), eq = '';
    if (S.mode === 'points') eq = 'Équivalent : pente <b>' + fmt(p.s, 2) + '</b> · parallèle <b>' + sgn(p.par0) + ' K</b>';
    else if (S.mode === 'pente') eq = 'Équivalent : ' + fmt(S.x1, 0) + ' °C ext. → <b>' + fmt(M.curve(pr, S.x1).Tf) + '</b> · ' + fmt(S.x2, 0) + ' °C ext. → <b>' + fmt(M.curve(pr, S.x2).Tf) + ' °C</b>';
    else eq = 'Équivalent : pente <b>' + fmt(p.s, 2) + '</b>';
    $('eqLine').innerHTML = eq;

    // info-bulle consigne / parallèle (chiffres de la courbe en cours)
    $('tip').innerHTML = '<b>Consigne</b> : la température voulue dans la pièce (jour ou nuit). Chaque 1 K de consigne déplace le départ de <b>1 + pente</b> K : avec la pente actuelle (' + fmt(p.s, 2) + '), +1 K de consigne = <b>+' + fmt(1 + p.s) + ' K</b> de départ.<br><b>Parallèle</b> : une correction fixe ajoutée au départ à tous les extérieurs (+3 K = +3 K de départ). Réglage d\'installateur, plus rare.';
    // détails
    var h = '';
    if (S.expo) h += 'Courbe : passe par les deux points et se creuse entre eux selon l\'exposant n = ' + fmt(S.n, 2) + '.';
    else h += 'Droite : départ = ambiance + pente × (ambiance − ext.) + parallèle.';
    if (S.mode === 'points') {
      h += '<br><b>Calcul</b> : pente = (' + fmt(S.y2) + ' − ' + fmt(S.y1) + ') / (' + N(S.x1) + ' − ' + N(S.x2) + ') = ' + fmt(p.s, 2) + ' ; parallèle = ' + fmt(S.y1) + ' − ' + fmt(S.Tref) + ' − ' + fmt(p.s, 2) + ' × (' + fmt(S.Tref) + ' − ' + N(S.x1) + ') = ' + fmt(p.par0) + ' K.';
    } else if (S.mode === 'ideal') {
      var rg = S.regime.split(',').map(Number);
      h += '<br><b>Calcul</b> : pente = (' + rg[0] + ' − 20) / (20 − ' + N(S.Te0) + ') = ' + fmt(p.s, 2) + '.';
    }
    if (Math.abs(p.Ti - S.Tref) > 0.01) {
      var dd0 = M.curve(p, S.Te).Tf - M.curve(Object.assign({}, p, { Ti: S.Tref }), S.Te).Tf;
      h += '<br>Consigne ' + fmt(p.Ti) + ' °C au lieu de ' + fmt(S.Tref) + ' °C, avec les mêmes réglages : la courbe se décale de <b>' + sgn(dd0) + ' K</b> à cet ext. (pour une droite : (1 + pente) × écart de consigne).';
    }
    if (c.ghost) {
      var rr = M.curve(c.ghost, S.Te).Tf, dd = r.Tf - rr;
      if (Math.abs(dd) > .005) h += '<br>' + c.ghostName + ' : <b>' + fmt(rr) + ' °C</b> à cet ext. ; écart : <b>' + sgn(dd) + ' K</b>.';
    }
    [['maxi', p.tmax], ['mini', p.tmin]].forEach(function (l) {
      if (l[1] == null) return;
      var te = M.extFor(Object.assign({}, p, { tmax: null, tmin: null }), l[1]);
      h += '<br>Départ ' + l[0] + ' ' + fmt(l[1], 0) + ' °C ' + (te == null ? 'non atteint dans la plage.' : 'atteint à ' + fmt(te) + ' °C ext.');
    });
    $('info').innerHTML = h;
    var tMin = S.Te - S.bmin, tMax = S.Te + S.bmax;
    $('bornesOut').innerHTML = 'À ' + fmt(S.Te) + ' °C ext. : borne mini <b>' + fmt(M.curve(p, tMin).Tf) + ' °C</b> (calculée à ' + fmt(tMin) + ' °C) · borne maxi <b>' + fmt(M.curve(p, tMax).Tf) + ' °C</b> (calculée à ' + fmt(tMax) + ' °C)';

    var rows = '', pts = [20, 15, 10, 5, 0, -5, -10, -15].filter(function (v) { return v > S.Te0 - 9; });
    if (pts.indexOf(S.Te0) < 0 && S.Te0 > -15) { pts.push(S.Te0); pts.sort(function (a, b) { return b - a; }); }
    pts.forEach(function (te) {
      var v = M.curve(p, te);
      rows += '<tr' + (te === S.Te0 ? ' class="hl"' : '') + '><td>' + te + ' °C' + (te === S.Te0 ? ' (base)' : '') + '</td><td>' + fmt(v.Tf) + ' °C</td><td>' + fmt(v.Tr) + ' °C</td></tr>';
    });
    $('tbody').innerHTML = rows;
    revCalc(p);

    tgt = target(c); if (!disp) disp = Object.assign({}, tgt);
    if (disp.tmax > 500 && tgt.tmax < 500) disp.tmax = tgt.tmax + 15;
    if (disp.tmin < -500 && tgt.tmin > -500) disp.tmin = tgt.tmin - 15;
    if (disp.g_tmax > 500 && tgt.g_tmax < 500) disp.g_tmax = tgt.g_tmax + 15;
    if (disp.g_tmin < -500 && tgt.g_tmin > -500) disp.g_tmin = tgt.g_tmin - 15;
    $('legRef').hidden = !c.ghost; $('legRefTxt').textContent = c.ghostName;
  }
  function revCalc(p) {
    var v = parseFloat(S.revTf), o = $('revOut');
    if (isNaN(v)) { o.textContent = ''; return; }
    var te = M.extFor(p, v);
    o.textContent = te == null ? 'Hors plage de la courbe.' : 'Un départ de ' + fmt(v) + ' °C correspond à ' + fmt(te) + ' °C ext.';
  }

  /* ---------- Formulaire ---------- */
  var plainFields = ['x1', 'y1', 'x2', 'y2', 'n', 'Tn', 'Tref', 'Te0', 'bmin', 'bmax'];
  function setVal(id, v) { if (document.activeElement !== $(id)) $(id).value = v; }
  function sync() {
    plainFields.forEach(function (k) { setVal(k, S[k]); });
    setVal('s', S.s); setVal('par', S.par); setVal('ti', tiOf(S));
    ['tmax', 'tmin'].forEach(function (k) { setVal(k, S[k] == null ? '' : S[k]); });
    $('revTf').value = S.revTf; $('regime').value = S.regime; $('emitter').value = S.emitter;
    $('expo').checked = S.expo; $('bornes').checked = S.bornes; $('nOut').textContent = 'n = ' + fmt(S.n, 2).replace(/,?0$/, '');
    $('bDay').setAttribute('aria-pressed', !S.night); $('bNight').setAttribute('aria-pressed', S.night);
    $('tiLbl').textContent = S.night ? 'Consigne nuit' : 'Consigne jour';
    Array.prototype.forEach.call($('modes').children, function (b) { b.setAttribute('aria-pressed', b.dataset.mode === S.mode); });
    $('parBox').hidden = S.mode !== 'pente';
    $('penteBox').hidden = S.mode !== 'pente'; $('pointsBox').hidden = S.mode !== 'points'; $('idealBox').hidden = S.mode !== 'ideal';
    $('pin').textContent = S.ref ? 'Retirer la référence' : 'Garder comme référence';
    $('hint').textContent = S.mode === 'points' ? 'Glisse pour lire · attrape un point (1 ou 2) pour le déplacer' : 'Glisse pour lire · attrape le point blanc pour changer la pente';
  }
  function update() { save(); sync(); render(); }

  function bindNumber(id, key, onSet) {
    $(id).addEventListener('input', function () {
      var v = parseFloat($(id).value.replace(',', '.'));
      if (isNaN(v)) return;
      if (onSet) onSet(v); else S[key] = v;
      update();
    });
  }
  plainFields.forEach(function (k) {
    bindNumber(k, k, function (v) {
      S[k] = v;
      if (k === 'n') { var m = ['1.1', '1.3', '1.4'].indexOf(String(v)); S.emitter = m < 0 ? 'custom' : String(v); }
    });
  });
  bindNumber('s', 's');
  bindNumber('par', 'par');
  bindNumber('ti', null, function (v) { S[S.night ? 'Tn' : 'Tj'] = v; });
  function stepper(minus, plus, get, set, d, lo, hi) {
    function go(sign) { var v = r2(get() + sign * d); set(Math.max(lo, Math.min(hi, v))); update(); }
    $(minus).onclick = function () { go(-1); }; $(plus).onclick = function () { go(1); };
  }
  stepper('sMinus', 'sPlus', function () { return S.s; }, function (v) { S.s = v; }, 0.05, 0.1, 4);
  stepper('parMinus', 'parPlus', function () { return S.par; }, function (v) { S.par = v; }, 0.5, -20, 30);
  stepper('tiMinus', 'tiPlus', function () { return tiOf(S); }, function (v) { S[S.night ? 'Tn' : 'Tj'] = v; }, 0.5, 5, 35);

  ['tmax', 'tmin'].forEach(function (k) {
    $(k).addEventListener('input', function () { var v = parseFloat($(k).value.replace(',', '.')); S[k] = isNaN(v) ? null : v; update(); });
  });
  $('revTf').addEventListener('input', function () { S.revTf = $('revTf').value; save(); if (last && last.p) revCalc(last.p); });
  $('regime').addEventListener('change', function () { S.regime = $('regime').value; update(); });
  $('emitter').addEventListener('change', function () { S.emitter = $('emitter').value; if (S.emitter !== 'custom') S.n = parseFloat(S.emitter); update(); });
  $('bornes').addEventListener('change', function () { S.bornes = $('bornes').checked; update(); });
  $('expo').addEventListener('change', function () { S.expo = $('expo').checked; update(); });
  $('bDay').onclick = function () { S.night = false; update(); };
  $('bNight').onclick = function () { S.night = true; update(); };
  $('pin').onclick = function () {
    if (S.ref) S.ref = null;
    else if (last && last.p) { S.ref = { Ti: last.p.Ti }; CURVE_KEYS.forEach(function (k) { S.ref[k] = S[k]; }); }
    update();
  };
  Array.prototype.forEach.call(document.querySelectorAll('[data-tip]'), function (b) {
    b.onclick = function () {
      var open = $('tip').hidden;
      $('tip').hidden = !open;
      Array.prototype.forEach.call(document.querySelectorAll('[data-tip]'), function (x) { x.setAttribute('aria-expanded', open); });
    };
  });
  $('errReset').onclick = function () { try { localStorage.removeItem(KEY); } catch (e) {} S = sanitize(Object.assign({}, DEFAULTS)); last = null; disp = null; update(); };

  /* Changement de mode : la courbe reste la même, ses valeurs sont converties */
  Array.prototype.forEach.call($('modes').children, function (b) {
    b.onclick = function () {
      var m = b.dataset.mode;
      if (m === S.mode) return;
      if (last && last.p) {
        var pr = Object.assign({}, last.p, { Ti: S.Tref });
        if (m === 'points') {
          if (Math.abs(S.x1 - S.x2) < 0.01) { S.x1 = 20; S.x2 = -5; }
          S.y1 = r1(M.curve(pr, S.x1).Tf); S.y2 = r1(M.curve(pr, S.x2).Tf);
        } else if (m === 'pente') { S.s = Math.max(0.1, r2(last.p.s)); S.par = r1(last.p.par0); }
      }
      S.mode = m; update();
    };
  });

  /* ---------- Gestes sur le graphique ---------- */
  var mode = null, dragPt = 0;
  function rel(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function nearMarker(pt) {
    if (!view) return false;
    var c = M.curve(disp, disp.Te);
    return Math.hypot(pt.x - view.X(disp.Te), pt.y - view.Y(c.Tf)) < 32;
  }
  function nearPoint(pt) {
    if (!view || S.mode !== 'points') return 0;
    var d1 = Math.hypot(pt.x - view.X(disp.x1), pt.y - view.Y(disp.y1)), d2 = Math.hypot(pt.x - view.X(disp.x2), pt.y - view.Y(disp.y2));
    if (Math.min(d1, d2) > 30) return 0;
    return d1 <= d2 ? 1 : 2;
  }
  function solveSlope(te, tf) {
    var Ti = tiOf(S), lo = 0.1, hi = 4;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2, st = Object.assign({}, S, { mode: 'pente', s: mid });
      if (M.curve(buildP(st, Ti), te).Tf < tf) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function pick(e) {
    if (!view) return;
    var pt = rel(e), Ti = tiOf(S);
    var te = view.xL - (pt.x - pad.l) / (W - pad.l - pad.r) * (view.xL - view.xR);
    var tf = view.yMin + (H - pad.b - pt.y) / (H - pad.t - pad.b) * (view.yMax - view.yMin);
    te = Math.round(Math.max(-25, Math.min(25, te)) * 2) / 2;
    tf = Math.round(Math.max(Ti, Math.min(120, tf)) * 2) / 2;
    if (mode === 'slope') {
      te = Math.min(te, Ti - 1);
      if (S.mode === 'ideal') { S.mode = 'pente'; S.par = 0; }
      S.s = Math.max(0.1, Math.min(4, r2(solveSlope(te, tf)))); S.Te = te;
    } else if (mode === 'point') {
      S['x' + dragPt] = te; S['y' + dragPt] = tf;
    } else S.Te = te;
    update();
  }
  var down = false;
  cv.addEventListener('pointerdown', function (e) {
    var pt = rel(e);
    dragPt = nearPoint(pt);
    mode = dragPt ? 'point' : (S.mode !== 'points' && nearMarker(pt)) ? 'slope' : 'read';
    lockY = mode !== 'read' ? Math.round(view.yMax) : null;
    down = true; cv.setPointerCapture(e.pointerId); pick(e);
  });
  cv.addEventListener('pointermove', function (e) {
    if (down) pick(e);
    else { var pt = rel(e); cv.style.cursor = (nearPoint(pt) || (S.mode !== 'points' && nearMarker(pt))) ? 'grab' : 'crosshair'; }
  });
  function release() { down = false; mode = null; lockY = null; }
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);

  /* ---------- PWA ---------- */
  var deferred;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('install').hidden = false; });
  $('install').onclick = function () { if (deferred) { deferred.prompt(); deferred = null; $('install').hidden = true; } };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});

  $('ver').textContent = VERSION;
  resize();
  try { update(); } catch (e) {
    /* état enregistré inutilisable : on repart de zéro une fois */
    try { localStorage.removeItem(KEY); } catch (x) {}
    S = sanitize(Object.assign({}, DEFAULTS)); last = null; disp = null; update();
  }
  requestAnimationFrame(frame);
})();
