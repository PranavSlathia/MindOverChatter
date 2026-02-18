---
inject: true
to: docker-compose.yml
after: "services:"
skip_if: "<%= name %>:"
---

  <%= name %>:
    build:
      context: services/<%= name %>
    ports:
      - "<%= port %>:<%= port %>"
<% if (needsAudioVolume) { %>
    volumes:
      - audio-data:/app/volumes/audio:ro
      - model-cache:/app/models
<% } else { %>
    volumes:
      - model-cache:/app/models
<% } %>
<% if (needsGpu) { %>
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
<% } %>
    networks:
      - moc-net
