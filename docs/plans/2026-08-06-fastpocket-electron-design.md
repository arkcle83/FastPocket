# FastPocket Electron — design technique

## Direction produit

FastPocket transforme Pocket TTS en lecteur desktop local. L’interface adopte une esthétique de console audio industrielle : graphite, ivoire chaud et accent ambre, avec une hiérarchie très lisible et des contrôles utilisables au clavier. L’utilisateur colle ou importe un document, choisit une langue et une voix, puis écoute le texte segment par segment.

Le suivi est volontairement fait au niveau de la ligne ou de la phrase. Pocket TTS ne fournit pas d’alignement mot-à-mot ; prétendre le contraire rendrait le surlignage faux. Un segment correspond à une ligne non vide, elle-même découpée aux fins de phrase lorsqu’elle devient trop longue.

## Architecture

```text
renderer/ (DOM, transport, surlignage)
        │ API minimale exposée par preload.js
        ▼
main.js (IPC, fichiers, PDF, FFmpeg, cycle de vie)
        │ JSON Lines sur stdin/stdout
        ▼
pocket_tts/desktop_backend.py (modèle persistant, synthèse, export)
        │
        ├── pocket_tts.TTSModel
        └── pocket_tts/desktop_config.py
              ├── lecture des YAML via utils/config.py
              └── préférences JSON atomiques dans Electron userData
```

Le modèle est chargé paresseusement au premier lancement de lecture. Un changement de langue ou de quantification recharge le modèle ; un changement de voix réutilise le modèle et son cache interne. Electron ne reçoit que des chemins temporaires contrôlés, lit les WAV puis transmet les octets au renderer.

## Lecture et export

Le renderer segmente le texte et synthétise une ligne à la fois. Pendant la lecture, la ligne active est surlignée et la suivante est préchargée. Pause, reprise et volume agissent immédiatement sur l’élément audio. La vitesse utilise `playbackRate`. Le pitch est appliqué en amont avec FFmpeg (`asetrate` + `aresample` + `atempo`) afin de préserver la durée.

L’export synthétise tous les segments dans le worker Python, concatène les formes d’onde avec un court silence puis laisse le processus principal appliquer vitesse, pitch et volume. WAV et MP3 utilisent le même pipeline, ce qui garantit que l’export correspond aux réglages visibles.

## Gestion des erreurs et vérification

Les entrées IPC sont validées dans `main.js` et dans Python. Les erreurs du worker sont renvoyées avec un message actionnable ; sa sortie de diagnostic reste sur stderr pour ne jamais casser le protocole JSON. Les fichiers temporaires sont confinés dans `app.getPath("temp")/fastpocket` et supprimés à la fermeture.

La vérification couvre la syntaxe JavaScript, la compilation Python, les fonctions de segmentation et la lecture/écriture atomique de la configuration sans charger les poids du modèle.
