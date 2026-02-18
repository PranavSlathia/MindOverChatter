---
to: apps/web/src/hooks/use-<%= name %>.ts
---
import { useState, useEffect } from "react";
<% if (withWebSocket) { %>
import { useWebSocket } from "@/hooks/use-websocket";
<% } %>

export function use<%= h.PascalCase(name) %>() {
  const [data, setData] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

<% if (withWebSocket) { %>
  const { send, subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe("<%= h.snake_case(name) %>.update", (params) => {
      setData(params);
    });
    return unsubscribe;
  }, [subscribe]);
<% } %>

  useEffect(() => {
    async function fetch() {
      try {
        setIsLoading(true);
        // TODO: fetch data
        setData(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, []);

  return { data, isLoading, error };
}
