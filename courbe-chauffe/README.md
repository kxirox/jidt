# Courbe de chauffe (PWA)

Application web installable (hors-ligne) pour calculer une courbe de chauffe et trouver la courbe idéale.
Sans dépendance ni build : HTML + JS + service worker.

## Utilisation
Servir le dossier en HTTPS ou sur localhost (`python3 -m http.server 8080`), puis « Installer » depuis le navigateur.

- **Recaler sur un point** : on donne un point connu (ext., départ, ambiance). L'app déduit le régime nominal
  (ex. 27 °C à 15 °C ext. → ≈ 48/33 °C à −7 °C) et donne le départ à n'importe quelle température extérieure,
  ou l'inverse, et pour une autre consigne d'ambiance.
- **Courbe idéale** : régime de dimensionnement (90/70 … 35/28), type d'émetteurs (exposant n), ext. de base, ambiance.

## Modèle (`model.js`)
`q = (Ti − Te)/(20 − Te0)` · `Tm = Ti + (Tm0 − 20)·q^(1/n)` · `Tf = Tm + (Tf0−Tr0)/2·q` · `Tr = Tm − (Tf0−Tr0)/2·q`

À `Te = Ti` le départ vaut la consigne : la courbe passe toujours par (20 ; 20) pour une ambiance de 20 °C.
