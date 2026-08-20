# Trizone Site v3.3.0 — Calagopus

Cette version remplace le statut Pterodactyl par Calagopus et ajoute une console serveur dans le panel admin.

## Variables Render

```env
CALAGOPUS_PANEL_URL=https://panel.omesky-heberg.com
CALAGOPUS_STATUS_API_KEY=...
CALAGOPUS_ADMIN_API_KEY=...
CALAGOPUS_PROXY_ID=...
CALAGOPUS_WARZONE_ID=...
CALAGOPUS_SPAWN_ID=...
CALAGOPUS_MINIGAME_ID=...
CALAGOPUS_AUTH_ID=...
```

Les anciennes variables `PTERODACTYL_*` ne sont plus utilisées par cette version.

## Permissions recommandées

- `Trizone-Status` : lecture des serveurs/statuts uniquement.
- `Trizone-Admin` : lecture + CONTROL `Read-console`, `Console`, `Start`, `Stop`, `Restart`.

## Fonctionnement

- état public des 5 serveurs via `/api/client/servers/{id}/resources`;
- un échantillon par minute, 60 points = 1 heure;
- le proxy est affiché en ligne pendant l'état `starting`;
- la console admin passe par le backend Node.js : aucune clé Calagopus n'est envoyée au navigateur;
- commandes, démarrage, arrêt et redémarrage sont protégés par `ADMIN_DISCORD_IDS`.

Après déploiement, ouvre **Administration > Console des serveurs**.


## Correctif v3.3.1

Le endpoint Calagopus `/resources` place l'état (`state`) directement dans l'objet `resources`, contrairement au format historique Pterodactyl qui utilisait `current_state` dans `attributes`. Le parseur accepte maintenant les deux formats, ainsi que le réseau imbriqué (`network.rx_bytes` / `network.tx_bytes`) et `memory_limit_bytes`.
