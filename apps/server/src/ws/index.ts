import type { JsonRpcRequest, JsonRpcResponse } from "@moc/shared";

export function handleWebSocketMessage(data: string): JsonRpcResponse | null {
  try {
    const message: JsonRpcRequest = JSON.parse(data);

    if (message.jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32600, message: "Invalid JSON-RPC version" },
      };
    }

    // Method routing
    switch (message.method) {
      case "session.start":
      case "session.end":
      case "message.send":
      case "emotion.face_update":
      case "assessment.submit":
      case "mood.log":
      case "memory.query":
      case "session.history":
        // TODO: implement handlers
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: { received: true, method: message.method },
        };
      default:
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` },
        };
    }
  } catch {
    return {
      jsonrpc: "2.0",
      id: "",
      error: { code: -32700, message: "Parse error" },
    };
  }
}
