import type { ClientMethod, ServerMethod } from "@moc/shared";
import { useEffect, useRef, useState } from "react";
import { WebSocketClient } from "@/lib/websocket.js";

const WS_URL = `ws://${window.location.hostname}:3000/ws`;

let sharedClient: WebSocketClient | null = null;

function getClient() {
  if (!sharedClient) {
    sharedClient = new WebSocketClient(WS_URL);
    sharedClient.connect();
  }
  return sharedClient;
}

export function useWebSocket() {
  const clientRef = useRef(getClient());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(clientRef.current.isConnected);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const send = (method: ClientMethod, params: Record<string, unknown> = {}) => {
    return clientRef.current.send(method, params);
  };

  const subscribe = (method: ServerMethod, handler: (params: Record<string, unknown>) => void) => {
    return clientRef.current.subscribe(method, handler);
  };

  return { send, subscribe, isConnected };
}
