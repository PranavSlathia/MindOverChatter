from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI(
    title="MindOverChatter Whisper Service",
    description="Speech-to-text using faster-whisper large-v3-turbo",
    version="0.1.0",
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "whisper"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    content = await file.read()
    # TODO: implement faster-whisper transcription
    return JSONResponse(
        content={
            "success": True,
            "data": {
                "text": "",
                "language": "hi",
                "segments": [],
                "duration": 0.0,
            },
        }
    )
