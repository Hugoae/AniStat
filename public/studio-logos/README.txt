Logos studios (PNG générés)
---------------------------
Sources : déposer les fichiers dans studio-logos-source/ puis lancer :
  npm run studio-logos

Le script écrit ici des PNG carrés + manifest.json.
Ne pas éditer manifest.json à la main.

Slug fichier = nom AniList normalisé (voir scripts/process-studio-logos.mjs).
Obtenir le slug d'un nom affiché sur le site :
  npm run studio-logos -- --slug "Brain's Base"
