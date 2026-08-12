# Trizone Site v2 — mise à jour

Cette version remplace les fichiers du site v1 sans changer les variables Render déjà configurées.

## Nouveautés

- design plus simple et plus naturel, toujours noir/violet selon la DA Trizone ;
- boutons corrigés (suppression des scripts inline bloqués par la CSP) ;
- le bouton **Connexion Discord** disparaît dès que la session est connectée ;
- affichage du **grade Minecraft** sur le compte ;
- panel admin beaucoup plus complet :
  - modifier le texte de l'accueil ;
  - modifier l'adresse serveur et le lien Discord ;
  - modifier les 3 blocs de présentation ;
  - modifier les coordonnées légales ;
  - changer le grade d'un joueur ;
  - bannir/débannir un compte du site ;
  - délier un compte Minecraft ;
  - consulter les webhooks Tebex ;
- page légale adaptée à un exploitant situé en Suisse ;
- nouveau plugin **TrizoneWebLink 1.1.0** : le grade LuckPerms est envoyé lors de `/link <code>` et `/link sync` permet de resynchroniser le grade.

## Mise à jour GitHub

Remplace le contenu du dépôt `trizone-site` par les fichiers de ce dossier, puis fais un commit sur `main`.
Render redéploiera automatiquement.

La migration de base de données est automatique au démarrage : la colonne `minecraft_rank` est ajoutée avec `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Il n'est donc pas nécessaire de recréer la base Supabase.

## Plugin Lobby

Remplace l'ancien `TrizoneWebLink-1.0.0.jar` par `TrizoneWebLink-1.1.0.jar` sur le Lobby.

Configuration :

```yaml
api-url: "https://trizone.club/api/minecraft/link/confirm"
sync-url: "https://trizone.club/api/minecraft/profile-sync"
secret: "LE_MEME_SECRET_QUE_MINECRAFT_LINK_SECRET_DANS_RENDER"
timeout-seconds: 8
```

Commandes joueur :

```text
/link 123456
/link sync
```

Le plugin lit le groupe primaire LuckPerms s'il est présent. Sinon le grade envoyé est `default` et l'admin peut le modifier depuis le panel.

## Panel admin

Après déploiement :

```text
https://trizone.club/admin.html
```

Dans **Modifier le site**, remplis notamment :

- identité / nom de l'exploitant ;
- adresse de contact ;
- e-mail de contact ;
- e-mail vie privée ;
- lien Discord.

Ces informations alimentent automatiquement la page :

```text
https://trizone.club/legal.html
```

## Suisse — points à vérifier avant d'ouvrir les paiements

La page légale fournit une base adaptée à la Suisse, mais les informations d'identité doivent être complétées avec de vraies coordonnées. Vérifie aussi dans Tebex :

- devise principale CHF si le store vise la clientèle suisse ;
- e-mail de support ;
- politique de remboursement ;
- informations et conditions affichées dans le checkout.

Tebex reste le prestataire qui traite les paiements et agit comme Merchant of Record dans son Checkout.
