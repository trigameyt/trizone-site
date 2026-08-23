# Trizone v3.3.4 — correctif Render / PostgreSQL / Stripe

## PostgreSQL

Le site garde TLS actif (`DATABASE_SSL=true`). Sans certificat CA fourni par le fournisseur, la validation de chaîne est désactivée pour éviter l’erreur `SELF_SIGNED_CERT_IN_CHAIN`.

- `DATABASE_SSL_REJECT_UNAUTHORIZED=false` : compatible avec la configuration actuelle.
- Pour activer la validation stricte : renseigner `DATABASE_SSL_CA` ou `DATABASE_SSL_CA_PATH`, puis mettre `DATABASE_SSL_REJECT_UNAUTHORIZED=true`.

## Stripe

Le site accepte désormais les nouvelles variables de grades **et** les anciennes variables :

- Default+ : `STRIPE_PRICE_DEFAULT_PLUS_ID` ou `STRIPE_PRICE_COPPER_ID`
- VIP : `STRIPE_PRICE_VIP_ID` ou `STRIPE_PRICE_IRON_ID`
- VIP+ : `STRIPE_PRICE_VIP_PLUS_ID` ou `STRIPE_PRICE_GOLD_ID`
- Hero : `STRIPE_PRICE_HERO_ID` ou `STRIPE_PRICE_DIAMOND_ID`
- Emperor/Imperator : `STRIPE_PRICE_EMPEROR_ID`, `STRIPE_PRICE_IMPERATOR_ID` ou `STRIPE_PRICE_NETHERITE_ID`

Même compatibilité pour les variables `DISCORD_ROLE_*_ID`.

Le serveur affiche au démarrage uniquement les **noms** de variables détectées, jamais leur valeur.
