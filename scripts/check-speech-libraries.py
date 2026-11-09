"""Checks that installed speech libraries still expose what Kiteva's adapters call.

Runs against the real packages from a provider's requirements file, without downloading or
loading any model: model objects are replaced with fakes, so only the library API is tested.
"""
import importlib
import inspect
import json
import sys
from pathlib import Path

app_root = Path(__file__).resolve().parents[1]
providers = app_root / "src/server/audio/providers"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def accepts(function, *names):
    parameters = inspect.signature(function).parameters
    missing = [name for name in names if name not in parameters]
    require(not missing, f"{function.__qualname__} no longer accepts {', '.join(missing)}")


def kokoro():
    from kokoro_onnx import Kokoro
    from misaki.zh import ZHG2P
    import soundfile  # noqa: F401

    accepts(Kokoro.__init__, "model_path", "voices_path")
    accepts(Kokoro.create, "text", "voice", "speed", "lang", "is_phonemes")
    require(callable(ZHG2P), "misaki.zh.ZHG2P is no longer callable")


def pocket():
    from pocket_tts import TTSModel, export_model_state
    from pocket_tts.utils.utils import get_predefined_voice

    accepts(TTSModel.load_model, "language", "config")
    accepts(TTSModel.generate_audio, "copy_state")
    for name in ("get_state_for_audio_prompt", "generate_audio", "sample_rate"):
        require(hasattr(TTSModel, name), f"TTSModel no longer has {name}")
    require(callable(export_model_state), "export_model_state is no longer callable")
    accepts(get_predefined_voice, "language")


def pocket_zh():
    import soundfile  # noqa: F401
    import wetext  # noqa: F401
    from pocket_tts import TTSModel  # noqa: F401
    from pocket_tts.models.mimi import build_mimi  # noqa: F401
    from pocket_tts.models.tts_model import stamp_state_names  # noqa: F401
    from pocket_tts.quantization import RECOMMENDED_CONFIG, apply_dynamic_int8  # noqa: F401
    from pocket_tts.utils.config import load_config  # noqa: F401
    from pocket_tts.utils.weights_loading import get_training_checkpoint_state_dicts  # noqa: F401
    from pocket_tts.conditioners.text import SentencePieceTokenizer

    class FakeSentencePiece:
        def encode(self, text, out_type=int):
            return [5, 6, 7]

    tokenizer = object.__new__(SentencePieceTokenizer)
    tokenizer.sp = FakeSentencePiece()
    tokens = tokenizer("你好").tokens
    require(tokens.shape[-1] == 3, "The Mandarin checkpoint reads tokenizer(text).tokens[0]")


def ming():
    sys.path.insert(0, str(providers / "ming-tts"))
    from mlx_adapter import mlx_request
    from mlx_audio.tts.models.bailingmm.bailingmm import Model, ming3_instruction, _MING3_VOICE_RE  # noqa: F401
    from mlx_audio.tts.utils import load_model  # noqa: F401

    accepts(load_model, "model_path")
    catalog = json.loads((app_root / "src/shared/ming-tts-catalog.json").read_text(encoding="utf-8"))
    common = dict(text="Hello", language_id="en", use_zero_spk_emb=True, cfg=2.0, sigma=0.25,
                  temperature=0.0)
    requests = [
        mlx_request(dict(common, task="TTS", prompt_wav_path="reference.wav", prompt_text="Hello")),
        mlx_request(dict(common, task="IP", controls={"ip": catalog["voices"][0].get("ip") or "voice"})),
    ]
    parameters = inspect.signature(Model.generate).parameters
    source = inspect.getsource(Model.generate)
    for request in requests:
        for name in [*request, "verbose"]:
            require(name in parameters or f'"{name}"' in source or f"'{name}'" in source,
                    f"Model.generate no longer handles {name}")


checks = {"kokoro": kokoro, "pocket": pocket, "pocket-zh": pocket_zh, "ming": ming}

if __name__ == "__main__":
    engine = sys.argv[1] if len(sys.argv) == 2 else None
    if engine not in checks:
        raise SystemExit(f"Usage: check-speech-libraries.py {{{','.join(checks)}}}")
    checks[engine]()
    print(f"{engine} speech libraries match Kiteva's adapters")
