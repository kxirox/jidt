/* Modèle de courbe de chauffe.
 *
 * Une courbe de référence F(Te) est définie à l'ambiance de référence Tref (20 °C en général) :
 *   - droite   : F = Tref + s·(Tref − Te) + par0
 *   - courbe   : passe par deux points (x1,y1) et (x2,y2) avec la forme des corps de chauffe,
 *                φ(Te) = (Tref − Te)^(1/n)  (écart d'eau ∝ charge^(1/n), Q ∝ ΔT^n)
 *                F = y1 + (y2 − y1)·(φ(Te) − φ(x1)) / (φ(x2) − φ(x1))
 *                (avec n = 1 on retrouve exactement la droite)
 *   p.lin pondère les deux (1 = droite, 0 = courbe), ce qui permet de les fondre en animation.
 *
 * Consigne d'ambiance Ti différente de Tref : la charge ne dépend que de (Ti − Te), donc
 *   Tf(Te) = Ti + F(Te + Tref − Ti) − Tref        (pour une droite : décalage de (1+s)·ΔTi).
 * Le départ ne descend jamais sous Ti. Plafond / plancher optionnels (p.tmax, p.tmin).
 * Retour : Tf − spread·charge, avec charge = (Ti − Te)/(20 − Te0).
 */
(function (root) {
  var TI_DESIGN = 20;

  function phi(p, t) { return Math.pow(Math.max(p.Tref - t, 0), 1 / p.n); }

  function F(p, Te) {
    var w = p.lin == null ? 1 : p.lin;
    var line = p.Tref + p.s * (p.Tref - Te) + p.par0;
    if (w >= 1) return line;
    var d = phi(p, p.x2) - phi(p, p.x1);
    if (Math.abs(d) < 1e-9) return line;
    var e = p.y1 + (p.y2 - p.y1) * (phi(p, Te) - phi(p, p.x1)) / d;
    return w * line + (1 - w) * e;
  }

  function curve(p, Te) {
    var Ti = p.Ti;
    var Tf = Math.max(Ti, Ti + F(p, Te + p.Tref - Ti) - p.Tref);
    var q = Math.max(Ti - Te, 0) / (TI_DESIGN - p.Te0);
    var dT = (p.spread == null ? 15 : p.spread) * q, Tfu = Tf;
    if (p.tmax != null && Tf > p.tmax) Tf = Math.max(p.tmax, Ti);
    if (p.tmin != null && q > 0 && Tf < p.tmin) Tf = p.tmin;
    /* départ bridé : l'écart départ-retour diminue avec l'écart à l'ambiance */
    if (Tf !== Tfu && Tfu > Ti) dT *= Math.max(0, Tf - Ti) / (Tfu - Ti);
    var Tr = Math.max(Ti, Tf - dT);
    return { Tf: Tf, Tr: Tr, Tm: (Tf + Tr) / 2, q: q };
  }

  /* Pente et parallèle de la droite passant par deux points, à l'ambiance Tref. */
  function lineOf(x1, y1, x2, y2, Tref) {
    if (Math.abs(x1 - x2) < 1e-9) return null;
    var s = (y2 - y1) / (x1 - x2);
    return { s: s, par0: y1 - Tref - s * (Tref - x1) };
  }

  /* Pente d'un point (Te, Tf) par rapport à l'ambiance Ti. */
  function slopeOf(pt) {
    return pt.Ti > pt.Te ? (pt.Tf - pt.Ti) / (pt.Ti - pt.Te) : null;
  }

  /* Température extérieure donnant un départ Tf (dichotomie, courbe décroissante en Te). */
  function extFor(p, Tf) {
    var lo = p.Ti + 30, hi = p.Te0 - 40;
    if (Tf >= curve(p, hi).Tf || Tf <= curve(p, lo).Tf) return null;
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2;
      if (curve(p, mid).Tf > Tf) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  var api = { TI_DESIGN: TI_DESIGN, curve: curve, lineOf: lineOf, slopeOf: slopeOf, extFor: extFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chauffe = api;
})(typeof self !== 'undefined' ? self : this);
