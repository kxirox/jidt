/* Modèle de courbe de chauffe (loi d'émission des corps de chauffe).
 *
 * Régime nominal : départ Tf0 / retour Tr0, ambiance de dimensionnement 20 °C,
 * température extérieure de base Te0.
 *   q   = (Ti - Te) / (20 - Te0)               charge relative du bâtiment
 *   Tm  = Ti + (Tm0 - 20) * q^(1/n)            température moyenne de l'eau
 *   Tf  = Tm + (Tf0 - Tr0)/2 * q               départ
 *   Tr  = Tm - (Tf0 - Tr0)/2 * q               retour
 * n : exposant du corps de chauffe (plancher 1,1 ; radiateur 1,3 ; convecteur 1,4+).
 */
(function (root) {
  var TI_DESIGN = 20;

  /* p.lin : poids 0..1 de la droite (0 = loi émetteurs, 1 = droite).
     Droite : Tf = Ti + s·(Ti − Te) + par (parallèle, en K), jamais sous Ti.
     p.tmax / p.tmin : plafond et plancher de départ (optionnels).
     L'écart départ-retour suit la charge. */
  function curve(p, Te) {
    var q = (p.Ti - Te) / (TI_DESIGN - p.Te0), qp = Math.max(q, 0);
    var w = p.lin || 0, half = (p.Tf0 - p.Tr0) / 2, Tf = 0, Tr = 0;
    if (w < 1) {
      if (q > 0) {
        var dTm0 = (p.Tf0 + p.Tr0) / 2 - TI_DESIGN;
        var Tm = p.Ti + dTm0 * Math.pow(q, 1 / p.n);
        Tf = (1 - w) * (Tm + half * q); Tr = (1 - w) * (Tm - half * q);
      } else { Tf = (1 - w) * p.Ti; Tr = Tf; }
    }
    if (w > 0) {
      var f = Math.max(p.Ti, p.Ti + p.s * (p.Ti - Te) + (p.par || 0));
      Tf += w * f; Tr += w * Math.max(p.Ti, f - 2 * half * qp);
    }
    var dT = Tf - Tr, Tf0 = Tf;
    if (p.tmax != null && Tf > p.tmax) Tf = Math.max(p.tmax, p.Ti);
    if (p.tmin != null && q > 0 && Tf < p.tmin) Tf = p.tmin;
    /* départ bridé : l'écart départ-retour diminue avec l'écart à l'ambiance */
    if (Tf !== Tf0 && Tf0 > p.Ti) dT *= Math.max(0, Tf - p.Ti) / (Tf0 - p.Ti);
    Tr = Math.max(p.Ti, Tf - dT);
    return { Tf: Tf, Tr: Tr, Tm: (Tf + Tr) / 2, q: qp };
  }

  /* Pente de la droite passant par un point (Te, Tf) à ambiance Ti. */
  function slopeOf(pt) {
    return pt.Ti > pt.Te ? (pt.Tf - pt.Ti) / (pt.Ti - pt.Te) : null;
  }

  /* Recale le régime nominal pour que la courbe passe par (Te, Tf) mesuré
     à ambiance Ti. L'écart départ-retour nominal (spread) est conservé. */
  function calibrate(pt, base) {
    var q = (pt.Ti - pt.Te) / (TI_DESIGN - base.Te0);
    if (q <= 0) return null;
    var half = (base.Tf0 - base.Tr0) / 2;
    var dTm0 = (pt.Tf - pt.Ti - half * q) / Math.pow(q, 1 / base.n);
    var Tm0 = TI_DESIGN + dTm0;
    return { Te0: base.Te0, n: base.n, Tf0: Tm0 + half, Tr0: Tm0 - half };
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

  var api = { TI_DESIGN: TI_DESIGN, curve: curve, calibrate: calibrate, slopeOf: slopeOf, extFor: extFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chauffe = api;
})(typeof self !== 'undefined' ? self : this);
