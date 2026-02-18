from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI(
    title="MindOverChatter Emotion Service",
    description="Voice emotion detection using SenseVoice + librosa prosody analysis",
    version="0.1.0",
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "emotion"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    content = await file.read()
    # TODO: implement SenseVoice emotion detection + librosa prosody
    return JSONResponse(
        content={
            "success": True,
            "data": {
                "emotion": {
                    "label": "neutral",
                    "confidence": 0.0,
                    "scores": {
                        "happy": 0.0,
                        "sad": 0.0,
                        "angry": 0.0,
                        "neutral": 0.0,
                    },
                },
                "prosody": {
                    "pitch_mean": 0.0,
                    "pitch_std": 0.0,
                    "energy_mean": 0.0,
                    "energy_std": 0.0,
                    "speaking_rate": 0.0,
                    "mfcc_summary": [],
                },
            },
        }
    )
