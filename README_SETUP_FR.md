# Trizone — installation complète

Ce projet contient :

- le site public Trizone ;
- une connexion Discord OAuth2 ;
- un compte joueur ;
- un compte administrateur déterminé par Discord ID ;
- une liaison sécurisée du compte Minecraft via `/link <code>` ;
- une boutique alimentée par l'API Headless de Tebex ;
- un endpoint webhook Tebex avec vérification de signature ;
- un panel admin avec utilisateurs, comptes liés, événements Tebex et annonce du site ;
- le code source du plugin Paper `TrizoneWebLink`.

## 1. Important : GitHub Pages ne suffit plus

Cette version n'est plus un simple site HTML/CSS/JS. Elle a besoin d'un serveur Node.js pour :

- garder les secrets Discord/Tebex hors du navigateur ;
- gérer les sessions ;
- communiquer avec PostgreSQL ;
- recevoir les webhooks Tebex ;
- vérifier les codes `/link`.

Garde le dépôt GitHub, mais déploie-le comme **Web Service**, par exemple sur Render. Pour tester, le plan gratuit convient. Pour une boutique en production, un service toujours actif est préférable afin que les webhooks répondent immédiatement.

## 2. Mettre le projet sur GitHub

Dans ton dépôt `trigameyt/trizone-site` :

1. supprime les anciens fichiers de test si nécessaire ;
2. envoie le contenu de ce dossier à la racine du dépôt ;
3. vérifie que `package.json`, `server.js`, `public/`, `src/` et `database/` sont directement à la racine ;
4. ne mets JAMAIS ton fichier `.env` ou tes secrets sur GitHub.

## 3. Créer la base PostgreSQL

Tu peux utiliser Supabase, Neon ou une autre base PostgreSQL.

Avec Supabase :

1. crée un projet ;
2. ouvre l'éditeur SQL ;
3. copie tout le contenu de `database/schema.sql` ;
4. exécute le script ;
5. dans **Connect**, récupère la chaîne PostgreSQL et place-la plus tard dans `DATABASE_URL`.

Tables créées :

- `users`
- `minecraft_accounts`
- `link_codes`
- `tebex_events`
- `site_settings`

## 4. Créer l'application Discord

Dans le Discord Developer Portal :

1. crée une application `Trizone` ;
2. ouvre **OAuth2** ;
3. copie le `Client ID` ;
4. crée/récupère le `Client Secret` ;
5. ajoute comme Redirect URI :

```text
https://trizone.club/auth/discord/callback
```

Pour tester avant le domaine final, ajoute aussi l'URL Render :

```text
https://TON-SERVICE.onrender.com/auth/discord/callback
```

Le site demande uniquement le scope Discord `identify`.

## 5. Ton compte admin

Il n'y a pas de mot de passe admin séparé. C'est volontaire.

Dans la variable :

```text
ADMIN_DISCORD_IDS=TON_DISCORD_ID
```

mets ton ID Discord numérique.

Pour plusieurs admins :

```text
ADMIN_DISCORD_IDS=123456789012345678,987654321098765432
```

Une personne qui se connecte avec un Discord ID présent dans cette liste voit le bouton **Admin** et peut ouvrir `/admin.html`.

## 6. Générer les secrets

Dans PowerShell, tu peux générer deux longues valeurs aléatoires :

```powershell
([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
```

Lance la commande deux fois.

- première valeur -> `SESSION_SECRET`
- deuxième valeur -> `MINECRAFT_LINK_SECRET`

Ne les publie jamais.

## 7. Déployer sur Render

1. crée un compte Render ;
2. **New > Web Service** ;
3. connecte ton dépôt GitHub `trizone-site` ;
4. Runtime : Node ;
5. Build Command :

```text
npm install
```

6. Start Command :

```text
npm start
```

7. ajoute les variables suivantes :

```text
NODE_ENV=production
BASE_URL=https://trizone.club
SESSION_SECRET=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=https://trizone.club/auth/discord/callback
ADMIN_DISCORD_IDS=...
DATABASE_URL=...
DATABASE_SSL=true
TEBEX_WEBSTORE_TOKEN=...
TEBEX_WEBHOOK_SECRET=...
MINECRAFT_LINK_SECRET=...
```

Avant que `trizone.club` pointe sur Render, mets temporairement `BASE_URL` et `DISCORD_REDIRECT_URI` sur l'adresse `onrender.com` donnée par Render, teste la connexion, puis remplace-les par le domaine final.

## 8. Relier `trizone.club` au site

Dans Render :

1. ouvre ton Web Service ;
2. **Settings > Custom Domains** ;
3. ajoute `trizone.club` ;
4. ajoute éventuellement `www.trizone.club` ;
5. Render affiche les enregistrements DNS exacts à mettre dans Spaceship ;
6. ajoute ces DNS chez Spaceship.

Ne supprime pas les DNS Minecraft :

```text
play.trizone.club -> ton proxy Minecraft
_minecraft._tcp.play.trizone.club -> port du proxy
```

Le site utilise le domaine racine `trizone.club`, Minecraft reste sur `play.trizone.club`.

---

# Configuration Tebex complète

## 9. Créer le projet Tebex

1. crée/ouvre ton compte Creator Tebex ;
2. crée un projet pour Trizone ;
3. choisis Minecraft: Java Edition ;
4. complète les informations demandées ;
5. termine la vérification d'identité ;
6. crée les catégories et produits ;
7. fais un paiement de test ;
8. soumets le projet à la review Tebex avant l'ouverture publique.

### Âge

Tebex exige que le titulaire Creator ait au moins 18 ans. Si le propriétaire du projet est mineur, le compte/wallet et la vérification doivent être faits par un parent ou tuteur éligible, puis Tebex prévoit une procédure de transfert lorsque le créateur atteint 18 ans.

## 10. Installer le plugin Tebex officiel sur Minecraft

Utilise de préférence le nouveau plugin officiel **Tebex-Minecraft**, qui prend en charge notamment Paper/Bukkit et Velocity.

Pour ton réseau, tu peux :

- mettre Tebex sur Velocity pour les commandes qui peuvent être exécutées au niveau proxy ;
- ajouter aussi un Game Server Tebex sur un Paper précis si une commande doit être exécutée sur ce serveur ;
- créer plusieurs Game Servers dans Tebex si les produits ont des livraisons différentes selon Lobby/Warzone/etc.

Installation :

1. dans Tebex Creator, ouvre **Game Servers** ;
2. clique **Connect Game Server** ;
3. choisis Plugin ;
4. télécharge la bonne variante ;
5. mets le `.jar` dans `plugins/` ;
6. redémarre ;
7. dans la console, utilise :

```text
tebex.secret TA_CLE_SERVEUR_TEBEX
```

8. vérifie :

```text
tebex.info
```

9. en cas de besoin :

```text
tebex.forcecheck
tebex.refresh
tebex.debug true
```

Désactive le debug après le diagnostic.

## 11. Créer les produits Tebex

Exemples de catégories :

```text
Grades
Cosmétiques
Pass / Abonnements
Soutien
```

Si tu vends des clés/crates, vérifie impérativement qu'elles respectent les règles Tebex et Minecraft. Évite les récompenses payantes aléatoires : privilégie des achats déterministes où le joueur sait exactement ce qu'il reçoit.

Pour chaque package :

1. donne un nom ;
2. ajoute une description ;
3. ajoute une image ;
4. définis le prix ;
5. configure les commandes de livraison ;
6. choisis si le joueur doit être en ligne ;
7. teste le package sur ton propre compte.

Exemples de commandes :

```text
lp user {username} parent add vip
```

ou selon ton plugin de clés :

```text
crate key give {username} legendary 3
```

Adapte les placeholders aux placeholders fournis par Tebex dans son interface de commandes. Teste toujours avec un produit de test avant de vendre.

## 12. Trouver `TEBEX_WEBSTORE_TOKEN`

Le site utilise la **Headless API** de Tebex.

Il te faut l'identifiant de webstore utilisé dans les URLs Headless du type :

```text
https://headless.tebex.io/api/accounts/TON_TOKEN/categories
```

Il ressemble souvent à :

```text
t66x-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Mets-le dans :

```text
TEBEX_WEBSTORE_TOKEN=...
```

Le site appelle ensuite automatiquement :

```text
/categories?includePackages=1
```

pour afficher tes catégories et packages.

## 13. Fonctionnement d'un achat sur le site

Le code fourni fait ce flux :

```text
Joueur connecté Discord
        ↓
Compte Minecraft lié
        ↓
Clique Acheter
        ↓
Le backend crée un Basket Tebex avec son pseudo Minecraft
        ↓
Le package est ajouté au basket
        ↓
Authentification Tebex si nécessaire
        ↓
Checkout Tebex
        ↓
Paiement
        ↓
Plugin Tebex -> commandes serveur
        ↓
Webhook Tebex -> historique/panel admin du site
```

Les informations de carte bancaire ne passent jamais par ton serveur Node.js.

## 14. Configurer les Webhooks Tebex

Une fois le site accessible en HTTPS :

1. Tebex Creator -> **Developers > Webhooks > Endpoints** ;
2. ajoute :

```text
https://trizone.club/api/tebex/webhook
```

3. copie le **Webhook Secret** dans :

```text
TEBEX_WEBHOOK_SECRET=...
```

4. redéploie/redémarre le site ;
5. dans Tebex, clique **Validate**.

Le code renvoie automatiquement l'ID demandé pour `validation.webhook`.

Abonnements utiles au minimum :

```text
payment.completed
payment.refunded
payment.dispute.opened
payment.dispute.won
payment.dispute.lost
recurring-payment.started
recurring-payment.renewed
recurring-payment.ended
```

Le serveur vérifie `X-Signature` avant d'accepter un webhook.

## 15. Paiements : ce que Tebex gère

Le checkout est fait par Tebex, pas par Trizone :

- traitement du paiement ;
- taxes applicables au client ;
- nombreuses méthodes de paiement ;
- fraude/chargebacks selon les conditions Tebex ;
- facturation acheteur côté Tebex ;
- statut paiement/remboursement/chargeback ;
- paiement de test avant mise en ligne.

Le site Trizone ne doit jamais décider qu'un achat est payé uniquement parce que la page affiche `payment=success`. La preuve serveur vient du webhook Tebex signé.

## 16. Règles produits importantes

Avant d'ouvrir :

- respecte le Minecraft EULA et les Usage Guidelines ;
- ne présente jamais Trizone comme serveur officiel Mojang/Microsoft ;
- laisse le disclaimer présent dans le footer ;
- évite les avantages compétitifs interdits par les règles Minecraft ;
- évite toute mécanique assimilable à du gambling/lootbox payante ;
- respecte aussi l'Acceptable Use Policy Tebex.

## 17. Configurer le plugin `/link`

Dans `minecraft-link-plugin/` se trouve le code du plugin Paper.

Il permet :

```text
/link 123456
```

Flux :

1. le joueur se connecte au site avec Discord ;
2. il clique **Générer mon code** ;
3. le site génère un code valable 10 minutes ;
4. le joueur lance `/link CODE` en jeu ;
5. le plugin envoie `code + UUID + pseudo` à l'API du site ;
6. le site lie le Discord ID au véritable UUID du joueur connecté.

Dans :

```text
plugins/TrizoneWebLink/config.yml
```

mets :

```yaml
api-url: "https://trizone.club/api/minecraft/link/confirm"
secret: "LA_MEME_VALEUR_QUE_MINECRAFT_LINK_SECRET"
timeout-seconds: 8
```

## 18. Compiler `TrizoneWebLink`

Le projet utilise Java 21 et Maven.

Dans PowerShell :

```powershell
cd "CHEMIN\VERS\trizone-site\minecraft-link-plugin"
mvn -U clean package
```

ou double-clique :

```text
build-windows.bat
```

Le JAR sera :

```text
target\TrizoneWebLink-1.0.0.jar
```

Place-le dans `plugins/` du Paper sur lequel les joueurs exécutent `/link`.

## 19. Test complet avant ouverture

Teste dans cet ordre :

1. `https://trizone.club/health` renvoie `ok: true` ;
2. connexion Discord ;
3. ton compte affiche le badge ADMIN ;
4. génération du code `/link` ;
5. `/link CODE` en jeu ;
6. le pseudo Minecraft apparaît sur le site ;
7. les produits Tebex apparaissent dans Boutique ;
8. paiement de test Tebex ;
9. commande de livraison exécutée sur Minecraft ;
10. `payment.completed` apparaît dans le panel admin ;
11. test d'un remboursement si possible ;
12. test mobile du site ;
13. vérification des mentions légales/confidentialité.

## 20. Sécurité

Ne mets jamais dans le dépôt GitHub :

```text
DISCORD_CLIENT_SECRET
SESSION_SECRET
DATABASE_URL
TEBEX_WEBHOOK_SECRET
MINECRAFT_LINK_SECRET
clé secrète du plugin Tebex Minecraft
```

Ils doivent uniquement être dans les variables d'environnement Render et les configurations privées du serveur Minecraft.
