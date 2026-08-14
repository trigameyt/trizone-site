# Trizone Site v3.0 — Duels par kit + inventaire

Cette version ajoute au site Trizone :

- ELO indépendant pour chaque kit de duel.
- Tiers LT5 / HT5 / LT4 / HT4 / LT3 / HT3 / LT2 / HT2 / LT1 / HT1.
- Leaderboard sombre inspiré du modèle fourni, avec un onglet Overall + un onglet automatique par kit.
- Page Compte : stats globales + stats complètes par kit (ELO, tier, placement, wins, losses, kills, deaths, KDR, winrate, streak et best streak).
- Choix du kit dont l'ELO doit être affiché.
- Inventaire Survie, armure, offhand et Ender Chest synchronisés depuis le Lobby.
- Les nouveaux kits envoyés par PVPpractice sont ajoutés automatiquement au catalogue du site.

## Tiers ELO

- LT5 : 300+
- HT5 : 350+
- LT4 : 400+
- HT4 : 450+
- LT3 : 500+
- HT3 : 600+
- LT2 : 800+
- HT2 : 1000+
- LT1 : 1250+
- HT1 : 1500+

## API Minecraft ajoutée

Le site utilise le même `MINECRAFT_LINK_SECRET` que TrizoneWebLink :

- `POST /api/minecraft/duels/snapshot`
- `POST /api/minecraft/duels/settings`
- `POST /api/minecraft/game-sync`
- `GET /api/duels/kits`
- `GET /api/duels/player?player=Pseudo`
- `GET /api/duels/leaderboard?kit=overall`
- `GET /api/account/duels`
- `POST /api/account/duels/settings`
- `GET /api/account/game-data`

La base PostgreSQL est migrée automatiquement au démarrage avec les nouvelles tables `duel_kits`, `duel_player_stats`, `duel_player_settings` et `minecraft_game_data`.

## Important

Le classement Overall du site utilise la moyenne des ELO des kits déjà joués par le joueur. Les wins/losses/kills/deaths Overall sont la somme de tous ses kits.

Les anciennes données globales de `elo.yml` ne peuvent pas être réparties correctement entre plusieurs kits sans inventer de résultats. Par défaut, le nouveau classement par kit démarre donc à 300 ELO quand un joueur utilise un kit pour la première fois. L'ancien système reste présent dans le plugin historique pour compatibilité, mais le nouveau leaderboard et `/profile` utilisent les données v3.
