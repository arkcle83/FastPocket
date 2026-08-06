# FastPocket Desktop

Interface Electron locale pour lire le presse-papiers, un fichier texte ou un PDF avec Pocket TTS.

## Prérequis

- Node.js 22 ou plus récent
- Python 3.10 à 3.14
- [`uv`](https://docs.astral.sh/uv/) recommandé pour installer automatiquement les dépendances Python
- Windows, macOS ou Linux

Au premier lancement, les poids Pocket TTS et la voix choisie sont téléchargés depuis Hugging Face. Cette étape peut prendre plusieurs minutes ; les lancements suivants utilisent le cache local.

## Installation et lancement

```powershell
npm install
npm start
```

FastPocket cherche Python dans cet ordre :

1. le chemin défini dans `FASTPOCKET_PYTHON` ;
2. `.venv/Scripts/python.exe` sous Windows ou `.venv/bin/python` ailleurs ;
3. `uv run python` ;
4. `python` ou `python3` disponible dans le `PATH`.

Pour préparer explicitement l’environnement Python :

```powershell
uv sync
npm start
```

## Dépendances npm

| Paquet | Rôle |
|---|---|
| `electron` | Fenêtre desktop, IPC sécurisé, presse-papiers et dialogues natifs |
| `pdf-parse` | Extraction locale du texte des PDF |
| `ffmpeg-static` | Pitch indépendant, vitesse/volume et export MP3/WAV |

Les dépendances Python restent celles du projet Pocket TTS (`torch`, `scipy`, `fastapi`, etc.) et sont déclarées dans `pyproject.toml`.

## Utilisation

- `Coller` charge le texte du presse-papiers.
- `TXT / PDF` ouvre un document local de 30 Mo maximum.
- `+` ajoute un WAV, MP3, FLAC ou `.safetensors` comme voix personnalisée.
- `Ctrl + Espace` lance ou met en pause ; `Alt + ←/→` change de segment.
- Le pitch est prétraité par FFmpeg. Sa modification s’applique au prochain segment généré.
- L’export applique la voix, la vitesse, le pitch et le volume visibles.

Le surlignage suit les lignes ou phrases, pas chaque mot : Pocket TTS ne fournit actuellement aucun alignement temporel mot-à-mot.

### Voix personnalisées et accès Hugging Face

Les voix intégrées fonctionnent sans compte. Le clonage à partir de ton propre fichier audio nécessite actuellement l’accès aux poids Pocket TTS avec voice cloning sur Hugging Face : accepte les conditions du dépôt de modèle, puis authentifie la machine avant de lancer FastPocket.

```powershell
uvx hf auth login
```

Sans cette autorisation, Pocket TTS renvoie une erreur d’accès lors de l’utilisation du bouton `+` ; FastPocket l’affiche sans interrompre le reste de l’application.

## Vérification

```powershell
npm run check
npm test
```

Les préférences sont lues et écrites par `pocket_tts/desktop_config.py`. Ce module s’appuie sur `pocket_tts/utils/config.py` pour découvrir et valider les configurations YAML, tout en stockant les réglages utilisateur dans le dossier `userData` d’Electron. Le code source Python de configuration n’est donc jamais réécrit à chaud.
