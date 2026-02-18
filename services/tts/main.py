from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI(
    title="MindOverChatter TTS Service",
    description="Text-to-speech using Kokoro TTS",
    version="0.1.0",
)


class SynthesizeRequest(BaseModel):
    text: str
    language: str = "hi"
    speed: float = 1.0


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tts"}


@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    # TODO: implement Kokoro TTS synthesis
    # Return audio binary when implemented
    return Response(
        content=b"",
        media_type="audio/wav",
    )
