# Trizone Site v3.3.2 — correctifs sécurité

Cette version applique les points de l'audit de sécurité du 20 août 2026.

## Corrigé

- `SESSION_SECRET` n'a plus aucun fallback public. Le serveur refuse de démarrer si le secret fait moins de 32 octets.
- `MINECRAFT_LINK_SECRET` est comparé avec `crypto.timingSafeEqual`.
- PostgreSQL vérifie désormais le certificat TLS par défaut (`DATABASE_SSL_REJECT_UNAUTHORIZED=true`).
- Une CA PEM personnalisée peut être fournie via `DATABASE_SSL_CA` ou `DATABASE_SSL_CA_PATH`.
- Un header `Permissions-Policy` restrictif est envoyé.

## Variables Render à vérifier avant le déploiement

- `SESSION_SECRET` : valeur aléatoire d'au moins 32 octets.
- `MINECRAFT_LINK_SECRET` : longue valeur aléatoire, identique à celle configurée dans les plugins Trizone concernés.
- `DATABASE_SSL=true`
- `DATABASE_SSL_REJECT_UNAUTHORIZED=true`
- `DATABASE_SSL_CA` : laisser vide si le certificat de la base est signé par une CA déjà reconnue par Node.js. Sinon, coller la CA PEM fournie par l'hébergeur.

Ne mets jamais les vraies valeurs de ces secrets dans GitHub.
