import type { ClientMethod, JsonRpcRequest, ServerMethod } from "@moc/shared";

type MessageHandler = (params: Record<string, unknown>) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Map<string, Set<MessageHandler>>();
  private pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        // Response to a request (has id)
        if (data.id && this.pendingRequests.has(data.id)) {
          const pending = this.pendingRequests.get(data.id)!;
          this.pendingRequests.delete(data.id);
          if (data.error) {
            pending.reject(data.error);
          } else {
            pending.resolve(data.result);
          }
          return;
        }

        // Notification (no id, has method)
        if (data.method) {
          const handlers = this.handlers.get(data.method);
          if (handlers) {
            for (const handler of handlers) {
              handler(data.params);
            }
          }
        }
      } catch {
        console.error("Failed to parse WebSocket message");
      }
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        this.reconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private reconnect() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }

  send(method: ClientMethod, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = crypto.randomUUID();
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify(message));
    });
  }

  subscribe(method: ServerMethod, handler: MessageHandler): () => void {
    if (!this.handlers.has(method)) {
      this.handlers.set(method, new Set());
    }
    this.handlers.get(method)?.add(handler);

    return () => {
      this.handlers.get(method)?.delete(handler);
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws?.close();
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
