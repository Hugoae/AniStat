# Contribuer à AniStat

Merci de ton intérêt pour AniStat ! Ce guide couvre les retours, idées et contributions légères.

## Avant d’ouvrir une issue

1. Vérifie que le profil AniList testé est **public**
2. Regarde les [issues existantes](https://github.com/Hugoae/AniStat/issues)
3. Prépare une **capture d’écran** si c’est un problème visuel

## Signaler un bug

Utilise le template **Bug report** et indique :
- le pseudo AniList concerné (si public)
- l’onglet et la période sélectionnée
- ce que tu attendais vs. ce que tu vois
- navigateur + OS

## Proposer une idée

Utilise le template **Feature request**. Décris le cas d’usage : *« En tant qu’utilisateur, je voudrais… »*.

## Pull requests

Les PR sont acceptées pour des corrections ciblées. Pour une fonctionnalité large, ouvre d’abord une issue pour en discuter.

```bash
git clone https://github.com/Hugoae/AniStat.git
cd AniStat
npm install
cp .env.example .env.local
npm run dev
npm test
npm run lint
```

## Ton & langue

- Issues et PR : français ou anglais
- Messages de commit : clairs et descriptifs

## Projet non officiel

AniStat n’est pas affilié à AniList. Ne partage pas de tokens ou clés privées dans les issues.

Merci !
