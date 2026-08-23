# Trizone v3.3.6 — mentions légales + sécurité

## Mentions légales

- Les coordonnées de l’exploitant ne sont plus affichées dans un gros bloc en haut de la page légale.
- Elles apparaissent en petit, mais lisible, dans le footer de `/legal.html`.
- Le footer de toutes les pages contient un lien `Mentions légales`.
- Le panel admin explique précisément quoi renseigner : identité légale, adresse postale complète et e-mail valable.
- Le serveur refuse désormais de créer une session Stripe Checkout tant que ces trois champs ne sont pas renseignés.
- La page cite les principales bases légales suisses : LCD art. 3 al. 1 let. s, LPD art. 7, 8, 19 et 25, OIP art. 8 al. 1.

## Sécurité ajoutée

- CSP renforcée (`frame-ancestors 'none'`, `form-action 'self'`, scripts inline par attribut interdits, workers interdits).
- HSTS explicite en production.
- `Referrer-Policy: no-referrer`.
- contrôle d’origine supplémentaire contre le CSRF sur les requêtes POST/PUT/PATCH/DELETE provenant du navigateur ; les routes `/api/minecraft/*` restent authentifiées par `X-Trizone-Secret`.
- `Cache-Control: no-store` sur `/api/me`, `/api/account/*` et `/api/admin/*`.
- avertissement au démarrage si Render est en production avec une clé Stripe `sk_test_...`; confirmation dans les logs si une clé `sk_live_...` est détectée.

## Important avant d’ouvrir la boutique

Dans `Admin > Informations légales — Suisse`, renseigner :

1. le nom complet de la personne qui exploite juridiquement la boutique, ou la raison sociale si une société existe ;
2. son adresse postale complète de contact ;
3. une adresse e-mail valable et consultée.

Ne mets pas une fausse adresse et ne mets pas seulement `Trizone` comme identité si `Trizone` n’est pas une personne morale / raison sociale correspondante.
