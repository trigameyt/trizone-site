# Trizone v3.3.3 — Security + Shop Fix

Cette version conserve les correctifs de sécurité de v3.3.2 et restaure la configuration actuelle de la boutique.

## Correctifs conservés
- SESSION_SECRET obligatoire, 32 octets minimum.
- comparaison MINECRAFT_LINK_SECRET via crypto.timingSafeEqual.
- Permissions-Policy restrictive.
- TLS PostgreSQL configurable.

## Régression boutique corrigée
La v3.3.2 avait été construite depuis un snapshot qui contenait encore les anciens grades Copper/Iron/Gold/Diamond/Netherite.
Le serveur utilise maintenant directement : default_plus, vip, vip_plus, hero, emperor.

Variables Render attendues :
- STRIPE_PRICE_DEFAULT_PLUS_ID
- STRIPE_PRICE_VIP_ID
- STRIPE_PRICE_VIP_PLUS_ID
- STRIPE_PRICE_HERO_ID
- STRIPE_PRICE_EMPEROR_ID (ou STRIPE_PRICE_IMPERATOR_ID)
- DISCORD_ROLE_DEFAULT_PLUS_ID
- DISCORD_ROLE_VIP_ID
- DISCORD_ROLE_VIP_PLUS_ID
- DISCORD_ROLE_HERO_ID
- DISCORD_ROLE_EMPEROR_ID (ou DISCORD_ROLE_IMPERATOR_ID)

Aucun start.js auto-modifiant n'est nécessaire : server.js contient directement la bonne configuration.
