# Trizone — Mise à jour Stripe Managed Payments (VIP)

Ce pack remplace la logique des anciens grades boutique :
`copper -> iron -> gold -> diamond -> netherite`

par :

1. `default_plus` — affiché **Default+** — 2,90 CHF
2. `vip` — affiché **VIP** — 8,90 CHF
3. `vip_plus` — affiché **VIP+** — 9,90 CHF
4. `hero` — affiché **Hero** — 12,90 CHF
5. `emperor` — affiché **Emperor** — 19,90 CHF

## IMPORTANT : comment mettre ce ZIP sur GitHub

Ne dépose pas le fichier ZIP lui-même dans le dépôt.

1. Télécharge et décompresse ce ZIP.
2. Ouvre ton dépôt `trigameyt/trizone-site` sur GitHub.
3. Fais **Add file -> Upload files**.
4. Glisse le CONTENU du dossier décompressé à la racine du dépôt.
5. Autorise le remplacement de `package.json` et `render.yaml`.
6. Vérifie que le nouveau fichier `scripts/apply-shop-ranks.js` est bien présent.
7. Commit les changements.

Le script `scripts/apply-shop-ranks.js` modifie automatiquement la constante
`PAID_RANK_ORDER` dans `server.js` juste avant `npm start`.
Il est idempotent : s'il a déjà appliqué les nouveaux grades, il ne change rien.

## Stripe — produits à créer

Tous les produits :
- Paiement ponctuel
- CHF
- Taxes incluses
- Managed Payments éligible
- Jeux vidéo -> Téléchargeable -> Sans abonnement / droits permanents

Prix :
- Default+ : 2,90 CHF
- VIP : 8,90 CHF
- VIP+ : 9,90 CHF
- Hero : 12,90 CHF
- Emperor : 19,90 CHF

## Render — variables Stripe

Ajoute les Price IDs (`price_...`, PAS `prod_...`) :

STRIPE_PRICE_DEFAULT_PLUS_ID=price_...
STRIPE_PRICE_VIP_ID=price_...
STRIPE_PRICE_VIP_PLUS_ID=price_...
STRIPE_PRICE_HERO_ID=price_...
STRIPE_PRICE_EMPEROR_ID=price_...

Ajoute aussi :

STRIPE_SECRET_KEY=sk_test_...   # pendant les tests
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2025-03-31.basil

Quand tu passes en production, remplace `sk_test_...` par la clé LIVE,
les 5 Price IDs par ceux du mode LIVE et le `whsec_...` par celui du webhook LIVE.

## Webhook Stripe

URL :
https://trizone.club/api/stripe/webhook

Événements :
- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- charge.refunded

## Discord

Crée les rôles :
- Default+
- VIP
- VIP+
- Hero
- Emperor

Puis ajoute dans Render :

DISCORD_ROLE_DEFAULT_PLUS_ID=...
DISCORD_ROLE_VIP_ID=...
DISCORD_ROLE_VIP_PLUS_ID=...
DISCORD_ROLE_HERO_ID=...
DISCORD_ROLE_EMPEROR_ID=...

Le rôle du bot Trizone doit être AU-DESSUS des 5 rôles boutique et avoir
la permission **Gérer les rôles**.

## LuckPerms

À exécuter UNE fois dans la console Minecraft :

lp creategroup default_plus
lp creategroup vip
lp creategroup vip_plus
lp creategroup hero
lp creategroup emperor

lp group default_plus setweight 10
lp group vip setweight 20
lp group vip_plus setweight 30
lp group hero setweight 40
lp group emperor setweight 50

Tu peux ensuite configurer leurs préfixes et permissions comme tu veux.

## TrizoneWebLink — serveur Minecraft

Le fichier inclus :
`minecraft-link-plugin/src/main/resources/config.yml`

est le fichier PAR DÉFAUT pour les prochaines builds.

ATTENTION : si `plugins/TrizoneWebLink/config.yml` existe déjà sur ton serveur,
Bukkit ne le remplacera pas automatiquement.

Dans le fichier ACTUEL du serveur, remplace seulement :

paid-rank-groups:
  - copper
  - iron
  - gold
  - diamond
  - netherite

par :

paid-rank-groups:
  - default_plus
  - vip
  - vip_plus
  - hero
  - emperor

et garde ton vrai `secret:` actuel.

Le secret doit être identique à `MINECRAFT_LINK_SECRET` dans Render.

Redémarre ensuite complètement le serveur Paper.

## Test complet

1. Reste en environnement TEST Stripe.
2. Déploie cette mise à jour.
3. Mets les 5 `STRIPE_PRICE_*_ID` de TEST dans Render.
4. Configure le webhook TEST.
5. Connecte-toi sur Trizone avec Discord.
6. Lie ton compte Minecraft.
7. Achète Default+ en test.
8. Vérifie :
   - Checkout Stripe terminé
   - webhook reçu
   - commande enregistrée
   - rôle Discord donné
   - groupe LuckPerms donné par TrizoneWebLink

Carte Stripe de test :
4242 4242 4242 4242
Date future : par ex. 12/34
CVC : 123

## Sécurité

Ne mets JAMAIS dans GitHub :
- `sk_test_...`
- `sk_live_...`
- `whsec_...`
- token du bot Discord
- `MINECRAFT_LINK_SECRET`
- `DATABASE_URL` avec mot de passe

Ces valeurs restent uniquement dans Render / la configuration privée du serveur.
