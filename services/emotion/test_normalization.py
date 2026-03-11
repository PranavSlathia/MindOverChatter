"""Tests for W-2: emotion label normalization at the service boundary.

Verifies that classify_emotion() always returns canonical labels
(happy, sad, angry, neutral, fearful, disgusted, surprised)
and that the normalize_emotion_label() function maps correctly.
"""

from main import (
    CANONICAL_LABELS,
    ProsodyFeatures,
    classify_emotion,
    normalize_emotion_label,
)


# ---------------------------------------------------------------------------
# normalize_emotion_label unit tests
# ---------------------------------------------------------------------------


def test_canonical_labels_pass_through():
    """All 7 canonical labels should pass through unchanged."""
    for label in CANONICAL_LABELS:
        assert normalize_emotion_label(label) == label


def test_excited_maps_to_happy():
    assert normalize_emotion_label("excited") == "happy"


def test_calm_maps_to_neutral():
    assert normalize_emotion_label("calm") == "neutral"


def test_anxious_maps_to_fearful():
    assert normalize_emotion_label("anxious") == "fearful"


def test_unknown_label_maps_to_neutral():
    """Any unknown/unmapped label should fall back to neutral."""
    assert normalize_emotion_label("confused") == "neutral"
    assert normalize_emotion_label("bored") == "neutral"
    assert normalize_emotion_label("") == "neutral"


# ---------------------------------------------------------------------------
# classify_emotion returns only canonical labels
# ---------------------------------------------------------------------------


def _make_prosody(**kwargs) -> ProsodyFeatures:
    defaults = {
        "pitch_mean": 150.0,
        "pitch_std": 30.0,
        "energy_mean": 0.03,
        "energy_std": 0.01,
        "speaking_rate": 4.0,
        "mfcc_summary": [0.0] * 13,
    }
    defaults.update(kwargs)
    return ProsodyFeatures(**defaults)


def test_classify_no_pitch_returns_neutral():
    """Zero pitch → neutral."""
    label, conf = classify_emotion(_make_prosody(pitch_mean=0.0))
    assert label == "neutral"
    assert label in CANONICAL_LABELS


def test_classify_high_energy_high_pitch_stable_returns_happy():
    """Previously returned 'excited', now normalized to 'happy'."""
    label, conf = classify_emotion(
        _make_prosody(energy_mean=0.06, pitch_mean=250.0, pitch_std=10.0)
    )
    assert label == "happy"
    assert label in CANONICAL_LABELS


def test_classify_high_energy_high_pitch_variable_returns_angry():
    label, conf = classify_emotion(
        _make_prosody(energy_mean=0.06, pitch_mean=250.0, pitch_std=60.0)
    )
    assert label == "angry"
    assert label in CANONICAL_LABELS


def test_classify_variable_pitch_fast_returns_fearful():
    """Previously returned 'anxious', now normalized to 'fearful'."""
    label, conf = classify_emotion(
        _make_prosody(pitch_std=60.0, energy_mean=0.02, speaking_rate=7.0)
    )
    assert label == "fearful"
    assert label in CANONICAL_LABELS


def test_classify_variable_pitch_slow_returns_fearful():
    """Anxious path without fast speech still returns fearful."""
    label, conf = classify_emotion(
        _make_prosody(pitch_std=60.0, energy_mean=0.02, speaking_rate=3.0)
    )
    assert label == "fearful"
    assert label in CANONICAL_LABELS


def test_classify_low_energy_low_pitch_returns_sad():
    label, conf = classify_emotion(
        _make_prosody(energy_mean=0.005, pitch_mean=100.0, speaking_rate=1.5)
    )
    assert label == "sad"
    assert label in CANONICAL_LABELS


def test_classify_low_energy_moderate_pitch_returns_neutral():
    """Previously returned 'calm', now normalized to 'neutral'."""
    label, conf = classify_emotion(
        _make_prosody(energy_mean=0.005, pitch_mean=160.0, pitch_std=15.0)
    )
    assert label == "neutral"
    assert label in CANONICAL_LABELS


def test_classify_medium_everything_returns_neutral():
    label, conf = classify_emotion(
        _make_prosody(
            energy_mean=0.03, pitch_mean=170.0, pitch_std=30.0, speaking_rate=4.0
        )
    )
    assert label == "neutral"
    assert label in CANONICAL_LABELS


def test_classify_fast_speech_high_energy_returns_happy():
    """Previously returned 'excited', now normalized to 'happy'."""
    label, conf = classify_emotion(
        _make_prosody(
            energy_mean=0.06, pitch_mean=100.0, pitch_std=10.0, speaking_rate=7.0
        )
    )
    assert label == "happy"
    assert label in CANONICAL_LABELS


def test_all_classify_outputs_are_canonical():
    """Exhaustive sweep: try many prosody combinations and verify all outputs are canonical."""
    test_cases = [
        {"pitch_mean": 0.0},
        {"energy_mean": 0.06, "pitch_mean": 250.0, "pitch_std": 10.0},
        {"energy_mean": 0.06, "pitch_mean": 250.0, "pitch_std": 60.0},
        {"pitch_std": 60.0, "energy_mean": 0.02, "speaking_rate": 7.0},
        {"pitch_std": 60.0, "energy_mean": 0.02, "speaking_rate": 3.0},
        {"energy_mean": 0.005, "pitch_mean": 100.0, "speaking_rate": 1.5},
        {"energy_mean": 0.005, "pitch_mean": 100.0, "speaking_rate": 3.0},
        {"energy_mean": 0.005, "pitch_mean": 160.0, "pitch_std": 15.0},
        {"energy_mean": 0.005, "pitch_mean": 160.0, "pitch_std": 30.0},
        {"energy_mean": 0.03, "pitch_mean": 170.0, "pitch_std": 30.0},
        {"energy_mean": 0.06, "pitch_mean": 100.0, "speaking_rate": 7.0},
        {"energy_mean": 0.03, "pitch_mean": 300.0, "pitch_std": 10.0},
    ]
    for kwargs in test_cases:
        label, conf = classify_emotion(_make_prosody(**kwargs))
        assert label in CANONICAL_LABELS, f"Non-canonical label '{label}' from {kwargs}"
        assert 0.0 <= conf <= 1.0, f"Invalid confidence {conf} from {kwargs}"
