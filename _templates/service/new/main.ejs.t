---
to: services/<%= name %>/main.py
---
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI(
    title="MindOverChatter <%= h.PascalCase(name) %> Service",
    description="<%= description %>",
    version="0.1.0",
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "<%= name %>"}


# TODO: implement primary endpoint
# Example:
# @app.post("/process")
# async def process(file: UploadFile = File(...)):
#     content = await file.read()
#     result = ...  # Process with AI model
#     return {"success": True, "data": result}
