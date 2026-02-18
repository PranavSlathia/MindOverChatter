---
to: services/<%= name %>/pyproject.toml
---
[project]
name = "moc-<%= name %>"
version = "0.1.0"
description = "<%= description %>"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "python-multipart>=0.0.18",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
]
