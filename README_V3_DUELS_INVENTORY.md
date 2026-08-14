# Trizone Site v3.0.3 — Duels par kit + inventaire du monde world

Cette version corrige le leaderboard et l'affichage d'inventaire de la v3.0.x.

## Leaderboard

- Chaque compte Minecraft lié existe à **300 ELO** avant son premier duel.
- Overall + un onglet automatique par kit.
- Le Lobby peut maintenant relayer au site le miroir FullSync reçu depuis PVPpractice.
- Les stats réelles d'un kit remplacent automatiquement le 300 ELO par défaut.
- Les égalités de rang sont conservées.
- Les tiers LT5 → HT1 ont davantage de couleurs.

## Inventaire

- Source autorisée : serveur **Lobby**, monde **world** uniquement.
- Inventaire 36 slots en grille 9×4.
- Armure, offhand et Ender Chest 27 slots.
- Les autres mondes ne peuvent plus écraser la sauvegarde affichée sur le site.
- `/link sync` doit être lancé dans `world` pour forcer la synchro.

## Variables Render

```text
MINECRAFT_LINK_SECRET=<secret existant>
MINECRAFT_SURVIVAL_WORLD=world
```

`MINECRAFT_SURVIVAL_WORLD` est optionnelle : `world` est la valeur par défaut.
