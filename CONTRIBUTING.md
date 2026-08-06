# Contribuer à FastPocket

Merci de vouloir améliorer FastPocket. Le projet cherche des changements ciblés, testés et simples à maintenir.

## Mise en route

```bash
git clone https://github.com/arkcle83/FastPocket.git
cd FastPocket
uv sync
npm ci
npm run check
npm test
```

## Avant d’ouvrir une pull request

1. Crée une branche courte depuis `main` : `feat/import-epub` ou `fix/pdf-empty-pages`.
2. Limite la modification à un problème clairement défini.
3. Ajoute ou adapte un test pour chaque correction fonctionnelle.
4. Exécute `npm run check`, `npm test` et Ruff sur les fichiers Python modifiés.
5. Explique le comportement utilisateur, pas seulement les fichiers changés.

## Conventions

- JavaScript : CommonJS côté Electron, DOM natif côté renderer, aucune API Node exposée directement.
- Python : Ruff, 100 caractères par ligne et types sur les frontières IPC.
- Sécurité : `contextIsolation`, sandbox et validation des données IPC sont non négociables.
- Commits : format recommandé `type(scope): description`, par exemple `fix(reader): split long unpunctuated lines`.

Les changements du moteur Pocket TTS lui-même devraient généralement être proposés au [dépôt Kyutai](https://github.com/kyutai-labs/pocket-tts). FastPocket doit rester une couche desktop claire au-dessus du moteur.

## Signaler un problème

Utilise les modèles GitHub et joins : système d’exploitation, versions Node/Python, langue/voix, étapes de reproduction et message d’erreur complet. Ne joins jamais un échantillon vocal sans autorisation de diffusion.
