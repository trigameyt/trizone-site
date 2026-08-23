# Trizone v2.8 — Stripe Managed Payments

Cette version remplace Tebex par **Stripe Checkout + Managed Payments** et garde le système Trizone existant :

- connexion Discord OAuth2 ;
- liaison du compte Minecraft avec `/link <code>` ;
- boutique intégrée à `trizone.club` ;
- paiement Stripe Checkout avec `managed_payments[enabled]=true` ;
- vérification cryptographique des webhooks Stripe ;
- historique des achats en PostgreSQL ;
- rôle Discord automatique via Trizone-bot ;
- grade Minecraft automatique via TrizoneWebLink + LuckPerms ;
- remboursement intégral : recalcul automatique du meilleur grade encore actif ;
- aucun Price ID envoyé librement par le navigateur : le serveur mappe Copper/Iron/Gold/Diamond/Netherite vers les variables Render.

> IMPORTANT : Managed Payments est soumis à l'éligibilité Stripe. Le fait que la Suisse et les produits numériques soient supportés ne garantit pas que chaque produit Minecraft soit accepté. Active Managed Payments et vérifie la classification de chaque produit dans le Dashboard Stripe.

---

## 1. Flux complet d'un achat

1. Le joueur se connecte à Trizone avec Discord.
2. Il lie son compte Minecraft depuis `Compte` avec `/link <code>`.
3. Il choisit Default+, VIP, VIP+, Hero ou Emperor dans la boutique.
4. Le backend crée une Stripe Checkout Session avec Managed Payments activé.
5. Le joueur paie dans Stripe/Link.
6. Stripe envoie un webhook signé à `https://trizone.club/api/stripe/webhook`.
7. Trizone valide la signature et enregistre la commande dans `stripe_orders`.
8. Trizone-bot synchronise le rôle Discord correspondant au meilleur grade payé actif.
9. Une livraison Minecraft est ajoutée dans `minecraft_deliveries`.
10. TrizoneWebLink récupère la livraison, retire uniquement les anciens groupes boutique et ajoute le nouveau groupe LuckPerms.
11. Le plugin confirme la livraison au site.

La page `success` n'accorde jamais elle-même le grade : seule la confirmation Stripe par webhook le fait.

---

## 2. Créer / activer Stripe Managed Payments

Dans le Dashboard Stripe :

1. Termine la création et la vérification du compte Stripe.
2. Ouvre les réglages **Managed Payments**.
3. Active Managed Payments si Stripe te le propose.
4. Accepte les conditions Managed Payments.
5. Travaille d'abord en **mode test / sandbox**.

Si la personne qui ouvre/utilise le compte n'a pas encore 18 ans (ou l'âge de majorité applicable), les conditions générales Stripe prévoient l'ajout d'un représentant adulte sur le compte, par exemple un parent ou tuteur légal. Fais la vérification Stripe avec les vraies informations demandées par Stripe.

Le backend force l'API Stripe :

```text
2025-03-31.basil
```

ou la valeur plus récente que tu renseignes dans `STRIPE_API_VERSION`.

---

## 3. Créer les cinq produits Stripe

Dans **Product catalog**, crée cinq produits numériques :

```text
Copper
Iron
Gold
Diamond
Netherite
```

Pour chaque produit :

1. mets une description claire de ce que le grade donne ;
2. choisis un prix **One time / paiement unique** ;
3. CHF est conseillé comme devise de base pour Trizone ;
4. choisis un **Product tax code** marqué `Eligible for Managed Payments` ;
5. sauvegarde ;
6. copie le `Price ID`, qui commence par `price_`.

Pour un grade serveur livré automatiquement, le code générique `txcd_10000000 — General - Electronically Supplied Services` peut être un candidat si le produit correspond réellement à un service numérique automatisé avec très peu d'intervention humaine. Ce choix est une classification à vérifier dans Stripe ; ne choisis pas un code "jeu vidéo téléchargé" juste parce que le serveur fonctionne dans Minecraft.

Exemple de mapping :

```text
STRIPE_PRICE_DEFAULT_PLUS_ID=price_...
STRIPE_PRICE_VIP_ID=price_...
STRIPE_PRICE_VIP_PLUS_ID=price_...
STRIPE_PRICE_HERO_ID=price_...
STRIPE_PRICE_EMPEROR_ID=price_...
```

Les produits/prix de test et ceux de production sont différents : il faudra remplacer les Price IDs au passage en live.

---

## 4. Clés Stripe

Dans le Dashboard Stripe, récupère la **Secret key** de test puis ajoute-la dans Render :

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_API_VERSION=2025-03-31.basil
```

Ne mets jamais la secret key dans `shop.js`, dans GitHub ou dans le HTML.

---

## 5. Webhook Stripe

Crée un endpoint/destination webhook Stripe pointant vers :

```text
https://trizone.club/api/stripe/webhook
```

Sélectionne au minimum ces événements :

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
charge.refunded
```

Puis copie le **Signing secret** de l'endpoint :

```text
STRIPE_WEBHOOK_SECRET=whsec_...
```

Le code vérifie `Stripe-Signature` avec le body HTTP brut avant de traiter l'événement.

### Pourquoi plusieurs événements ?

- `checkout.session.completed` : checkout terminé ; la livraison n'est activée que si `payment_status` est déjà payé.
- `checkout.session.async_payment_succeeded` : confirme un moyen de paiement différé.
- `checkout.session.async_payment_failed` : annule une commande différée échouée.
- `charge.refunded` : si le remboursement devient intégral, le droit correspondant est désactivé et les grades sont recalculés.

---

## 6. Variables Render complètes

Dans **Render > ton Web Service > Environment**, configure :

```text
NODE_ENV=production
BASE_URL=https://trizone.club

SESSION_SECRET=UNE_LONGUE_VALEUR_ALEATOIRE

DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=https://trizone.club/auth/discord/callback

DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_ROLE_DEFAULT_PLUS_ID=...
DISCORD_ROLE_VIP_ID=...
DISCORD_ROLE_VIP_PLUS_ID=...
DISCORD_ROLE_HERO_ID=...
DISCORD_ROLE_EMPEROR_ID=...

ADMIN_DISCORD_IDS=TON_ID_DISCORD

DATABASE_URL=postgresql://...
DATABASE_SSL=true

STRIPE_API_VERSION=2025-03-31.basil
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_DEFAULT_PLUS_ID=price_...
STRIPE_PRICE_VIP_ID=price_...
STRIPE_PRICE_VIP_PLUS_ID=price_...
STRIPE_PRICE_HERO_ID=price_...
STRIPE_PRICE_EMPEROR_ID=price_...

MINECRAFT_LINK_SECRET=UNE_AUTRE_LONGUE_VALEUR_ALEATOIRE

PTERODACTYL_PANEL_URL=...
PTERODACTYL_API_KEY=...
PTERODACTYL_PROXY_ID=...
PTERODACTYL_WARZONE_ID=...
PTERODACTYL_SPAWN_ID=...
PTERODACTYL_MINIGAME_ID=...
PTERODACTYL_AUTH_ID=...
```

Pour générer un secret dans PowerShell :

```powershell
([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
```

Lance-la deux fois : une valeur pour `SESSION_SECRET`, une autre pour `MINECRAFT_LINK_SECRET`.

Après modification des variables, redeploie/restart le service Render.

---

## 7. Base PostgreSQL / Supabase

### Si tu gardes la base actuelle

Tu n'as pas besoin de supprimer l'ancienne base. Au démarrage, `src/db.js` crée automatiquement les nouvelles tables si elles n'existent pas :

```text
stripe_events
stripe_orders
minecraft_deliveries
```

Les anciennes tables Tebex éventuellement encore présentes dans PostgreSQL ne sont plus utilisées par v2.8.

### Nouvelle base

Si tu pars sur une base vide, exécute `database/schema.sql` dans l'éditeur SQL de Supabase, puis mets la connexion dans `DATABASE_URL`.

---

## 8. Discord OAuth2

Dans le Discord Developer Portal de l'application Trizone :

```text
Redirect URI : https://trizone.club/auth/discord/callback
```

Le site utilise le scope `identify` pour la connexion.

Variables :

```text
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=https://trizone.club/auth/discord/callback
```

---

## 9. Trizone-bot et rôles Discord

Le bot doit être présent dans le serveur Discord Trizone et pouvoir gérer les cinq rôles boutique.

Crée/identifie les rôles :

```text
Copper
Iron
Gold
Diamond
Netherite
```

Active le mode développeur Discord, copie l'ID de chaque rôle et renseigne les variables `DISCORD_ROLE_*_ID`.

Dans la hiérarchie Discord :

```text
Rôle de Trizone-bot
↑ au-dessus de
Netherite
Diamond
Gold
Iron
Copper
```

Donne au bot la permission **Manage Roles / Gérer les rôles**.

Le code ne modifie que les cinq Role IDs configurés. Il ne retire pas les rôles owner/admin/mod/helper/builder/etc.

---

## 10. Compiler TrizoneWebLink 1.2.0

Le code source est dans :

```text
minecraft-link-plugin/
```

Pré-requis Windows :

```text
Java 21
Maven 3.9+
```

Vérifie :

```powershell
java -version
mvn -version
```

Puis :

```powershell
cd "CHEMIN\VERS\Trizone-Site-v2.8-Stripe-Managed-Payments\minecraft-link-plugin"
Unblock-File .\build-windows.bat
.\build-windows.bat
```

Le résultat est :

```text
minecraft-link-plugin\target\TrizoneWebLink-1.2.0.jar
```

Le projet compile contre Paper API `1.21.11-R0.1-SNAPSHOT` en Java 21.

---

## 11. Installer TrizoneWebLink sur Minecraft

Installe `TrizoneWebLink-1.2.0.jar` sur **un seul serveur Paper** du réseau, par exemple Lobby, qui utilise la même base LuckPerms que les autres serveurs.

Il faut LuckPerms actif sur ce serveur.

Au premier lancement, ouvre :

```text
plugins/TrizoneWebLink/config.yml
```

Configuration :

```yaml
api-url: "https://trizone.club/api/minecraft/link/confirm"
sync-url: "https://trizone.club/api/minecraft/profile-sync"
delivery-url: "https://trizone.club/api/minecraft/deliveries?format=lines"
delivery-ack-base-url: "https://trizone.club/api/minecraft/deliveries"
poll-interval-seconds: 10
secret: "LE_MEME_SECRET_QUE_MINECRAFT_LINK_SECRET_DANS_RENDER"
timeout-seconds: 8
luckperms-command: "luckperms"
paid-rank-groups:
  - copper
  - iron
  - gold
  - diamond
  - netherite
```

Redémarre ensuite le serveur.

Le plugin interroge le site toutes les 10 secondes. Aucun port RCON n'a besoin d'être ouvert.

---

## 12. Groupes LuckPerms

Les groupes doivent exister avec exactement ces noms, sauf si tu modifies `paid-rank-groups` :

```text
copper
iron
gold
diamond
netherite
```

Exemples :

```text
/lp creategroup copper
/lp creategroup iron
/lp creategroup gold
/lp creategroup diamond
/lp creategroup netherite
```

Si le réseau utilise plusieurs serveurs Paper, configure LuckPerms avec un stockage partagé (par exemple MySQL/MariaDB) pour que le changement de groupe soit visible partout.

Le plugin retire uniquement les groupes listés dans `paid-rank-groups`, puis ajoute le meilleur grade boutique actif. Il ne touche pas aux groupes staff.

---

## 13. Tester la liaison compte

1. Connecte-toi sur `https://trizone.club/account.html` avec Discord.
2. Clique pour lier Minecraft.
3. Le site affiche un code à 6 chiffres.
4. En jeu :

```text
/link 123456
```

5. Vérifie que le pseudo/UUID apparaît dans la page Compte.

La commande :

```text
/link sync
```

renvoie manuellement le profil Minecraft courant au site.

---

## 14. Test de paiement complet

Fais le premier test avec Stripe en sandbox/test mode.

1. Mets des `price_...` de test dans Render.
2. Mets `sk_test_...` dans `STRIPE_SECRET_KEY`.
3. Utilise le webhook de test et son `whsec_...`.
4. Connecte Discord sur Trizone.
5. Lie Minecraft.
6. Ouvre la boutique et achète un grade.
7. Stripe fournit notamment la carte de test :

```text
4242 4242 4242 4242
```

avec une date future et n'importe quel CVC valide pour le test.

Teste aussi des adresses de facturation de plusieurs pays afin de voir le calcul de taxe Managed Payments.

Ensuite vérifie :

```text
Stripe Dashboard -> paiement réussi
Render Logs -> webhook reçu sans erreur
Compte Trizone -> achat affiché
Discord -> rôle ajouté
Minecraft -> groupe LuckPerms ajouté (dans les ~10 secondes)
Admin Trizone -> événement Stripe traité
```

---

## 15. Test d'upgrade et remboursement

Scénario conseillé :

1. achète Copper ;
2. vérifie que Copper est appliqué ;
3. achète Gold ;
4. vérifie que Copper est retiré et Gold ajouté ;
5. rembourse intégralement Gold dans Stripe ;
6. après le webhook `charge.refunded`, Trizone doit revenir à Copper, puisque Copper reste un achat actif.

Si aucun grade payé ne reste actif après remboursement, la cible Minecraft devient `default` et tous les groupes boutique sont retirés.

---

## 16. Passer en production

Quand tout fonctionne en test :

1. active/vérifie Managed Payments en live ;
2. recrée ou utilise les produits/prix **live** ;
3. remplace tous les `STRIPE_PRICE_*_ID` par les Price IDs live ;
4. remplace `STRIPE_SECRET_KEY=sk_test_...` par la clé live `sk_live_...` ;
5. crée/vérifie le webhook live vers `https://trizone.club/api/stripe/webhook` ;
6. remplace `STRIPE_WEBHOOK_SECRET` par le `whsec_...` du webhook live ;
7. redeploie Render ;
8. fais un petit achat réel de contrôle seulement lorsque tout le compte Stripe est prêt.

Ne mélange jamais un Price ID de test avec une clé live, ou inversement.

---

## 17. Sécurité intégrée dans v2.8

- Secret Stripe uniquement côté serveur.
- Les Price IDs sont choisis côté serveur, pas acceptés depuis le navigateur.
- Webhook signé et vérifié sur le body brut.
- Déduplication des événements par `event_id`.
- Livraison uniquement après confirmation du statut payé.
- Secret séparé `MINECRAFT_LINK_SECRET` entre le site et le plugin.
- Plugin Minecraft fait des requêtes sortantes : pas de RCON public.
- Les commandes LuckPerms ne sont pas construites à partir d'un grade libre envoyé par le joueur.
- La livraison ne touche qu'à une liste blanche de grades boutique.
- Les rôles Discord staff ne sont pas modifiés.

---

## 18. Fichiers principaux modifiés

```text
server.js
src/db.js
database/schema.sql
.env.example
render.yaml
public/shop.html
public/shop.js
public/account.js
public/admin.html
public/admin.js
public/legal.html
minecraft-link-plugin/pom.xml
minecraft-link-plugin/build-windows.bat
minecraft-link-plugin/src/main/java/fr/trizone/weblink/TrizoneWebLink.java
minecraft-link-plugin/src/main/resources/config.yml
minecraft-link-plugin/src/main/resources/plugin.yml
```

---

## 19. Déploiement GitHub -> Render

Depuis le dossier du site :

```powershell
git add .
git commit -m "Trizone v2.8 - Stripe Managed Payments"
git push
```

Si Render est connecté au dépôt GitHub, il reconstruira automatiquement le site. Sinon utilise **Manual Deploy > Deploy latest commit**.

Build command :

```text
npm install
```

Start command :

```text
npm start
```

Health check :

```text
/health
```

---

## 20. Diagnostic rapide

### `Boutique Stripe non configurée`
Vérifie `STRIPE_SECRET_KEY` et les cinq `STRIPE_PRICE_*_ID`.

### Stripe dit que Managed Payments n'est pas disponible
Vérifie l'activation du compte, l'éligibilité du produit, son tax code et l'API version.

### Webhook `Signature Stripe invalide`
Vérifie que `STRIPE_WEBHOOK_SECRET` correspond exactement au secret du webhook utilisé (test ou live).

### Paiement OK mais aucun rôle Discord
Vérifie `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, les Role IDs, la permission `Manage Roles` et la position du rôle bot.

### Paiement OK mais aucun grade Minecraft
Vérifie :

```text
plugins/TrizoneWebLink/config.yml -> secret
Render -> MINECRAFT_LINK_SECRET
LuckPerms actif
noms copper/iron/gold/diamond/netherite
logs du serveur Paper
```

### Le grade change sur Lobby mais pas ailleurs
LuckPerms n'utilise probablement pas le même stockage partagé sur tous les serveurs.

---

## Documentation Stripe utilisée pour cette intégration

- https://docs.stripe.com/payments/managed-payments/set-up
- https://docs.stripe.com/payments/managed-payments/eligibility
- https://docs.stripe.com/payments/managed-payments/how-it-works
- https://docs.stripe.com/webhooks

