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

  function curve(p, Te) {
    var q = (p.Ti - Te) / (TI_DESIGN - p.Te0);
    if (q <= 0) return { Tf: p.Ti, Tr: p.Ti, Tm: p.Ti, q: 0 };
    var dTm0 = (p.Tf0 + p.Tr0) / 2 - TI_DESIGN;
    var half = (p.Tf0 - p.Tr0) / 2;
    var Tm = p.Ti + dTm0 * Math.pow(q, 1 / p.n);
    return { Tf: Tm + half * q, Tr: Tm - half * q, Tm: Tm, q: q };
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

  /* Température extérieure donnant un départ Tf (dichotomie, courbe monotone). */
  function extFor(p, Tf) {
    var lo = p.Ti - 1e-6, hi = p.Te0 - 40;
    if (Tf <= p.Ti) return null;
    if (curve(p, hi).Tf < Tf) return null;
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2;
      if (curve(p, mid).Tf > Tf) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  var api = { TI_DESIGN: TI_DESIGN, curve: curve, calibrate: calibrate, extFor: extFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chauffe = api;
})(typeof self !== 'undefined' ? self : this);
