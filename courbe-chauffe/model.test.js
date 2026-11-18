/* Tests du modèle : node model.test.js */
const M = require('./model.js'), assert = require('assert');
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, a + ' ≠ ' + b);
const base = { Ti: 20, Tref: 20, Te0: -7, spread: 15, n: 1.3, lin: 1 };
// 1) droite : pente 1,4 → 27 °C à 15 °C ext., 57,8 °C à -7 °C
const L = Object.assign({}, base, { s: 1.4, par0: 0, x1: 20, y1: 20, x2: -7, y2: 57.8 });
near(M.curve(L, 15).Tf, 27); near(M.curve(L, -7).Tf, 57.8);
// 2) deux points (20;20) et (-5;55) → pente 1,4
const ln = M.lineOf(20, 20, -5, 55, 20); near(ln.s, 1.4); near(ln.par0, 0);
// 3) courbe : passe exactement par les deux points, au-dessus de la droite entre les deux
const C = Object.assign({}, L, { lin: 0, x2: -5, y2: 55 });
near(M.curve(C, 20).Tf, 20); near(M.curve(C, -5).Tf, 55);
assert(M.curve(C, 5).Tf > M.curve(Object.assign({}, C, { lin: 1 }), 5).Tf);
// 4) n = 1 : la courbe est la droite
const C1 = Object.assign({}, C, { n: 1 });
for (const t of [15, 5, 0, -5, -10]) near(M.curve(C1, t).Tf, 20 + 1.4 * (20 - t), 1e-6);
// 5) points quelconques (27;15)/(65;-5) : pente 1,9 et parallèle -2,5
const q = M.lineOf(15, 27, -5, 65, 20); near(q.s, 1.9); near(q.par0, -2.5);
const P = Object.assign({}, base, { s: q.s, par0: q.par0, x1: 15, y1: 27, x2: -5, y2: 65 });
near(M.curve(P, 15).Tf, 27); near(M.curve(P, -5).Tf, 65);
const PC = Object.assign({}, P, { lin: 0 }); near(M.curve(PC, 15).Tf, 27); near(M.curve(PC, -5).Tf, 65);
// 6) consigne 23 au lieu de 20, pente constante : décalage (1+s)·3 = 7,2 K
near(M.curve(Object.assign({}, L, { Ti: 23 }), 0).Tf - M.curve(L, 0).Tf, 3 * (1 + 1.4));
// 7) nuit 16 : la courbe descend
assert(M.curve(Object.assign({}, L, { Ti: 16 }), 0).Tf < M.curve(L, 0).Tf);
// 8) plafond et recherche inverse
const T = Object.assign({}, L, { tmax: 45 }); near(M.curve(T, -7).Tf, 45);
near(M.extFor(L, 35), 20 - 15 / 1.4, 1e-6);
console.log('OK');
