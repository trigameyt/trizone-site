# Trizone Site v3.2.0 - Kit Icons

Le site affiche les icones de kits depuis `icon_material` avec les textures Minecraft Java 1.21.11.

Le plugin met a jour ce champ via `POST /api/minecraft/duels/kits/icon` lorsqu'un admin utilise `/kiticon <kit>`.

Les vues mises a jour :
- leaderboard (onglets + badges + titre)
- compte (cartes de stats duel)
- panel admin (ordre des kits)

La CSP autorise uniquement `https://assets.mcasset.cloud` en plus des sources d'images deja existantes.
