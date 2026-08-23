# Trizone Site v3.3.8 — correctif icone Shield

Correctifs :

- `minecraft:shield` ne tente plus de charger `textures/item/shield.png` puis `textures/block/shield.png` (ces fichiers n'existent pas pour le bouclier Java, qui est rendu comme modele d'entite).
- Ajout d'une icone locale `public/assets/minecraft/shield.svg` pour le bouclier.
- Le cache-buster de `common.js` est uniformise en `?v=338` sur toutes les pages pour forcer le navigateur/CDN a prendre le correctif.
- Le correctif precedent qui supprimait le tooltip HTML `title="minecraft:..."` reste conserve.
