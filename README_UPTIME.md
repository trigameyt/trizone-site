# État des serveurs Minecraft — Trizone v2.4

La section d’uptime de la page d’accueil affiche maintenant **uniquement les serveurs Minecraft** :

- Proxy
- Warzone
- Spawn
- Minigame
- Auth

Chaque ligne affiche l’état actuel, un pourcentage de disponibilité, 60 barres d’historique (~20 minutes), le CPU, la RAM et l’uptime du serveur.

## Variables Render

Ajoute dans `Render > Environment` :

```text
PTERODACTYL_PANEL_URL=https://URL-DE-TON-PANEL
PTERODACTYL_API_KEY=TA_CLE_API_CLIENT

PTERODACTYL_PROXY_ID=0a96df42
PTERODACTYL_WARZONE_ID=ID_DU_SERVEUR_WARZONE
PTERODACTYL_SPAWN_ID=ID_DU_SERVEUR_SPAWN
PTERODACTYL_MINIGAME_ID=ID_DU_SERVEUR_MINIGAME
PTERODACTYL_AUTH_ID=ID_DU_SERVEUR_AUTH
```

Le proxy accepte aussi l’ancienne variable `PTERODACTYL_SERVER_ID`, donc si elle existe déjà tu peux la garder pendant la transition.

La clé Pterodactyl reste uniquement côté backend et n’est jamais envoyée au navigateur.

## Où trouver les IDs ?

Dans ton panel Pterodactyl, ouvre chaque serveur. L’identifiant court est celui utilisé par le panel/API pour identifier le serveur. Tu avais déjà `0a96df42` pour le proxy.

## Historique

Le navigateur recharge `/api/status-board` toutes les 20 secondes. Le backend conserve 60 points en mémoire, soit environ 20 minutes. L’historique repart à zéro après un redéploiement ou redémarrage Render.

## Commit

Upload tous les fichiers sur ton dépôt `trizone-site`, puis commit par exemple :

```text
Show Minecraft server uptime status
```


## Ajustements v2.6

- Le badge récapitulatif en haut affiche maintenant le pourcentage moyen de disponibilité des serveurs configurés.
- Le proxy est considéré **En ligne** lorsque Pterodactyl le signale `starting`, car certains proxys Velocity restent dans cet état malgré leur fonctionnement normal.
- Les autres serveurs conservent le comportement normal : `starting` = Démarrage.
