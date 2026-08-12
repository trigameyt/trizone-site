# Section État des services — Trizone v2.3

La page d’accueil contient maintenant un panneau de statut inspiré des pages d’uptime modernes, mais avec la DA sombre et violette de Trizone.

## Services affichés

- **Site web** : si l’API du site répond, le service est marqué en ligne.
- **Compte & API** : vérifie réellement la connexion PostgreSQL / Supabase avec `SELECT 1`.
- **Réseau Minecraft** : récupère l’état réel du proxy via l’API Client Pterodactyl.
- **Boutique** : indique si l’intégration Tebex est configurée.

Chaque ligne affiche :

- un pourcentage de disponibilité ;
- l’état actuel ;
- 60 petites barres d’historique ;
- une fenêtre de 20 minutes ;
- les informations utiles du service.

## Comment fonctionne l’historique

Le navigateur demande `/api/status-board` toutes les **20 secondes**.
Le backend conserve **60 points** en mémoire, soit environ **20 minutes** d’historique.

Important : cet historique est volontairement léger et repart à zéro à chaque redéploiement / redémarrage de Render. Il ne s’agit pas encore d’un historique longue durée stocké en base de données.

## Pterodactyl

Pour que la ligne **Réseau Minecraft** utilise les vraies données du proxy, garde ces variables dans Render :

```text
PTERODACTYL_PANEL_URL=https://URL-DE-TON-PANEL
PTERODACTYL_API_KEY=TA_CLE_API_CLIENT
PTERODACTYL_SERVER_ID=0a96df42
PTERODACTYL_SERVER_LABEL=Proxy
```

La clé Pterodactyl reste uniquement côté backend et n’est jamais envoyée au navigateur.

## Tebex

La ligne Boutique utilise simplement la présence de :

```text
TEBEX_WEBSTORE_TOKEN
```

Si cette variable n’est pas encore configurée, la boutique apparaît en **Configuration en cours** au lieu d’être marquée hors ligne.

## Déploiement

Upload tous les fichiers de cette version sur le dépôt GitHub `trizone-site`, puis commit par exemple avec :

```text
Redesign uptime section with Trizone style
```

Render redéploiera automatiquement le site.
