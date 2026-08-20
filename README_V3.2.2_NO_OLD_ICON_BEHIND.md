# Trizone v3.2.2 — suppression des anciennes icones derriere les textures

Correctif visuel uniquement.

- Les anciens glyphes/emoji `.mc-item-fallback` sont caches de force par CSS.
- `common.js` supprime aussi ces anciens elements du DOM s'ils proviennent d'un ancien cache.
- Les ressources HTML utilisent `?v=322` pour forcer le navigateur/CDN a recharger CSS/JS.

Aucun plugin Minecraft ne doit etre remplace.
