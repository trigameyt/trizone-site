TRIZONE SITE v3.2.4 - KIT DELETE AUTHORITATIVE
==============================================

Fix du kit fantome qui restait dans le leaderboard apres /kits del.

Le fichier kits.yml publie par le Lobby est maintenant la source de verite du catalogue :
- les kits absents sont marques inactifs ;
- un ancien snapshot PVPpractice ne peut plus les reactiver ;
- /api/duels/kits reconcilie aussi a la lecture, donc le fix est immediat apres redeploiement ;
- les anciennes stats restent conservees dans PostgreSQL.

Aucun SQL manuel requis.
