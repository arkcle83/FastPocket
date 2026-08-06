"""Desktop preferences layered safely on top of Pocket TTS model config.

The upstream ``utils/config.py`` describes immutable model YAML files. Editing that
Python source at runtime would be unsafe, so the desktop app reads its catalog through
that module and persists user preferences as JSON in Electron's userData directory.
"""

from __future__ import annotations

import ast
import json
import os
from pathlib import Path
from typing import Any

from pocket_tts.default_parameters import get_default_voice_for_language
from pocket_tts.utils.config import CONFIGS_DIR, load_config

DEFAULT_SETTINGS: dict[str, Any] = {
    "language": "french_24l",
    "voice": "estelle",
    "speed": 1.0,
    "pitch": 0,
    "volume": 0.9,
    "quantize": False,
}


def _predefined_voice_names() -> list[str]:
    """Read the upstream voice mapping without importing its heavy torch module."""
    utils_path = Path(__file__).parent / "utils" / "utils.py"
    tree = ast.parse(utils_path.read_text(encoding="utf-8"), filename=str(utils_path))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "_ORIGINS_OF_PREDEFINED_VOICES"
            for target in node.targets
        ):
            mapping = ast.literal_eval(node.value)
            return sorted(mapping)
    raise RuntimeError("Le catalogue de voix Pocket TTS est introuvable.")


def _settings_path() -> Path:
    configured = os.environ.get("FASTPOCKET_CONFIG")
    if configured:
        return Path(configured)
    return Path.home() / ".fastpocket" / "settings.json"


def model_catalog() -> dict[str, Any]:
    """Read the installed language YAMLs through Pocket TTS' existing config loader."""
    languages = []
    for config_path in sorted(CONFIGS_DIR.glob("*.yaml")):
        config = load_config(config_path)
        languages.append(
            {
                "id": config_path.stem,
                "sampleRate": config.mimi.sample_rate,
                "temperature": config.default_temperature,
                "defaultVoice": get_default_voice_for_language(config_path.stem),
            }
        )
    return {"languages": languages, "voices": _predefined_voice_names()}


def _validated(raw: dict[str, Any]) -> dict[str, Any]:
    catalog = model_catalog()
    languages = {item["id"] for item in catalog["languages"]}
    result = dict(DEFAULT_SETTINGS)

    language = raw.get("language")
    if language in languages:
        result["language"] = language

    voice = raw.get("voice")
    if isinstance(voice, str) and voice.strip() and len(voice) <= 2048:
        result["voice"] = voice.strip()

    try:
        result["speed"] = min(1.8, max(0.65, float(raw.get("speed", 1.0))))
        result["pitch"] = min(6, max(-6, int(raw.get("pitch", 0))))
        result["volume"] = min(1.0, max(0.0, float(raw.get("volume", 0.9))))
    except (TypeError, ValueError):
        pass
    result["quantize"] = bool(raw.get("quantize", False))
    return result


def load_desktop_settings() -> dict[str, Any]:
    path = _settings_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        raw = {}
    return _validated(raw if isinstance(raw, dict) else {})


def save_desktop_settings(settings: dict[str, Any]) -> dict[str, Any]:
    validated = _validated(settings)
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(validated, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)
    return validated
