# Trizone Site v3.2.3 — Deleted Kits Fix

- Le snapshot BACKEND (PVPpractice) est maintenant la liste officielle des kits actifs.
- Un kit qui n'existe plus sur PVPpractice est marque `active=false` dans PostgreSQL.
- Il disparait automatiquement des onglets du leaderboard, profils, Overall, admin et snapshot reseau.
- Les anciennes stats du kit sont conservees en base et ne sont pas supprimees.
- Si le kit est recree plus tard, le prochain snapshot BACKEND le reactive automatiquement.
- Le Lobby ne peut pas reactiver un ancien kit supprime par un snapshot obsolete.
