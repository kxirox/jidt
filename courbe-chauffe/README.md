# Courbe de chauffe (PWA)

Application web installable (hors-ligne) pour techniciens : visualiser et régler une courbe de chauffe.
Sans dépendance ni build : HTML + JS + service worker.

## Utilisation
Servir le dossier en HTTPS ou sur localhost (`python3 -m http.server 8080`), puis « Installer » depuis le navigateur.
Tests du modèle : `node model.test.js`.

**Écran principal** : graphique animé, résultat (départ à l'ext. choisi), puis la saisie.
- **Glisser sur le graphique** : lit le départ à n'importe quel ext.
- **Pente** : pente + parallèle (boutons − / +). Attraper le point blanc sur le graphique règle la pente au doigt.
- **2 points** : deux couples (ext., départ), p. ex. 20 → 20 et −5 → 65, ou 15 → 27. Les points sont déplaçables sur le graphique.
- **Idéale** : pente déduite d'un régime de dimensionnement (90/70 … 35/28).
- Les modes sont convertis entre eux : « Équivalent : pente … » / « Équivalent : −5 °C ext. → … » indique le réglage à saisir sur le régulateur.
- **Exposant radiateur** (case à cocher au-dessus du graphique) : décoché = droite ; coché = courbe (n = 1,3 par défaut) passant par les mêmes points.
- **Jour / Nuit** : consigne d'ambiance (p. ex. 20 / 16). Changer la consigne décale la courbe de (1 + pente) × écart ; la courbe d'origine reste en pointillés.
- **Garder comme référence** : fige la courbe actuelle en pointillés pour comparer une modification.
- **Réglages** (replié) : consigne nuit, ambiance de référence, émetteurs / exposant n, départ maxi / mini, ext. de base.
- **Détails** (replié) : calcul détaillé, retour, écarts, recherche inverse. **Tableau** (replié).

## Modèle (`model.js`)
Courbe de référence à l'ambiance `Tref` : droite `F = Tref + s·(Tref − Te) + par0`, ou courbe passant par deux points avec la forme des corps de chauffe
`φ(Te) = (Tref − Te)^(1/n)` (Q ∝ ΔT^n ; avec n = 1 on retrouve la droite).
Consigne `Ti` : `Tf(Te) = Ti + F(Te + Tref − Ti) − Tref`, départ jamais sous `Ti`.
Les conventions varient selon les régulateurs (pente/niveau Viessmann, pente/pied de courbe De Dietrich…) : à valider sur la notice.
