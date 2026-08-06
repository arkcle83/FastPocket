"""Persistent newline-delimited JSON worker used by the Electron application."""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import traceback
import uuid
from pathlib import Path
from typing import Any

from pocket_tts.desktop_config import load_desktop_settings, model_catalog, save_desktop_settings

logging.basicConfig(stream=sys.stderr, level=logging.INFO)
LOGGER = logging.getLogger("fastpocket.backend")

_model: Any | None = None
_model_key: tuple[str, bool] | None = None


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _status(message: str, phase: str = "working", **extra: Any) -> None:
    _emit({"event": "status", "phase": phase, "message": message, **extra})


def _audio_dir() -> Path:
    configured = os.environ.get("FASTPOCKET_AUDIO_DIR")
    path = Path(configured) if configured else Path(tempfile.gettempdir()) / "fastpocket"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_model(language: str, quantize: bool) -> Any:
    global _model, _model_key
    key = (language, quantize)
    if _model is None or _model_key != key:
        from pocket_tts import TTSModel

        _status(f"Chargement du modèle {language}…", "loading-model")
        _model = TTSModel.load_model(language=language, quantize=quantize)
        _model_key = key
        _status(f"Modèle {language} prêt", "ready")
    return _model


def _generate(text: str, voice: str, language: str, quantize: bool) -> tuple[Any, int]:
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("Le segment à lire est vide.")
    if len(cleaned) > 4000:
        raise ValueError("Un segment ne peut pas dépasser 4 000 caractères.")

    model = _get_model(language, quantize)
    _status("Préparation de la voix…", "voice")
    voice_state = model.get_state_for_audio_prompt(voice)
    _status("Synthèse en cours…", "synthesizing")
    audio = model.generate_audio(voice_state, cleaned)
    samples = audio.detach().cpu().numpy().astype("float32").reshape(-1)
    return samples, model.sample_rate


def _write_wav(samples: Any, sample_rate: int, prefix: str) -> Path:
    import scipy.io.wavfile

    path = _audio_dir() / f"{prefix}-{uuid.uuid4().hex}.wav"
    scipy.io.wavfile.write(path, sample_rate, samples)
    return path


def _handle(method: str, params: dict[str, Any]) -> Any:
    if method == "app:get-state":
        return {"settings": load_desktop_settings(), "catalog": model_catalog()}

    if method == "settings:save":
        return save_desktop_settings(params)

    if method == "tts:synthesize":
        samples, sample_rate = _generate(
            str(params.get("text", "")),
            str(params.get("voice", "alba")),
            str(params.get("language", "english")),
            bool(params.get("quantize", False)),
        )
        path = _write_wav(samples, sample_rate, "segment")
        _status("Audio prêt", "ready")
        return {
            "path": str(path),
            "sampleRate": sample_rate,
            "duration": len(samples) / sample_rate,
        }

    if method == "tts:export":
        import numpy as np

        segments = params.get("segments")
        if not isinstance(segments, list) or not segments or len(segments) > 5000:
            raise ValueError("L’export doit contenir entre 1 et 5 000 segments.")

        voice = str(params.get("voice", "alba"))
        language = str(params.get("language", "english"))
        quantize = bool(params.get("quantize", False))
        chunks: list[np.ndarray] = []
        sample_rate = 24000
        for index, segment in enumerate(segments):
            samples, sample_rate = _generate(str(segment), voice, language, quantize)
            chunks.append(samples)
            if index < len(segments) - 1:
                chunks.append(np.zeros(int(sample_rate * 0.08), dtype=np.float32))
            _status(
                f"Export : segment {index + 1}/{len(segments)}",
                "exporting",
                current=index + 1,
                total=len(segments),
            )
        combined = np.concatenate(chunks)
        path = _write_wav(combined, sample_rate, "export")
        _status("Synthèse de l’export terminée", "ready")
        return {"path": str(path), "sampleRate": sample_rate}

    if method == "ping":
        return {"ok": True}
    raise ValueError(f"Méthode inconnue : {method}")


def main() -> None:
    _status("Backend Python prêt", "ready")
    for line in sys.stdin:
        request: dict[str, Any] = {}
        try:
            request = json.loads(line)
            request_id = request.get("id")
            result = _handle(str(request.get("method", "")), request.get("params") or {})
            _emit({"id": request_id, "result": result})
        except Exception as error:  # noqa: BLE001 - keep the persistent worker alive per request.
            LOGGER.error("Desktop request failed:\n%s", traceback.format_exc())
            _emit(
                {
                    "id": request.get("id"),
                    "error": {"message": str(error), "type": type(error).__name__},
                }
            )


if __name__ == "__main__":
    main()
