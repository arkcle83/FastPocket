# Politique de sécurité

## Versions prises en charge

FastPocket est en phase initiale. Seule la dernière version de la branche `main` reçoit les correctifs de sécurité.

## Signaler une vulnérabilité

N’ouvre pas d’issue publique pour une vulnérabilité exploitable. Utilise **Security → Report a vulnerability** sur GitHub afin d’envoyer un rapport privé au mainteneur.

Le rapport doit préciser l’impact, les étapes de reproduction, les versions concernées et, si possible, une mitigation. Évite d’inclure des textes privés, tokens Hugging Face ou échantillons de voix personnels.

## Modèle de confiance

- Les documents sont traités localement.
- Le renderer Electron est sandboxé et ne reçoit qu’une API preload limitée.
- Les poids et voix intégrées peuvent être téléchargés depuis Hugging Face par Pocket TTS.
- Les chemins de fichiers et paramètres IPC sont validés dans le processus principal et le worker Python.

Le clonage vocal doit uniquement être utilisé avec un consentement explicite et légal.
