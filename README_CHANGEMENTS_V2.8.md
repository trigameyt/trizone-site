# Trizone v2.8 — changements

## Tebex supprimé de l'intégration active

La boutique utilise maintenant Stripe Checkout avec Managed Payments.

## Livraison automatique

- Stripe webhook -> PostgreSQL
- Stripe webhook -> rôle Discord via Trizone-bot
- Stripe webhook -> file `minecraft_deliveries`
- TrizoneWebLink 1.2.0 -> LuckPerms -> ACK vers le site

## Remboursements

Un remboursement intégral reçu via `charge.refunded` désactive la commande correspondante et recalcule le meilleur grade payé encore actif.

## Sécurité

Le frontend envoie uniquement `rank=copper|iron|gold|diamond|netherite`. Le Price ID réel est lu dans les variables d'environnement du backend. Les webhooks Stripe sont vérifiés avec `Stripe-Signature` sur le body brut.

## À faire avant production

Lis `README_SETUP_FR.md` de haut en bas et teste tout en sandbox Stripe.
