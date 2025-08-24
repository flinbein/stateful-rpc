[@flinbein/stateful-rpc](README.md)

# Network examples

## Websocket server with `ws` library

Server:
```typescript
import ws from "ws";
import { RPCSource } from "@flinbein/stateful-rpc";

// Create an RPC source with methods and initial state
export const rpcSource = new RPCSource({
    ping: () => "pong",
    echo: (msg) => msg,
});

const wss = new ws.Server({ port: 8080 });

wss.on("connection", (socket) => {

  RPCSource.start(rpcSource, (send, close) => {
   
    // Handle incoming messages from the WebSocket
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      send(...message);
    });
  
    // Handle WebSocket closure
    socket.on("close", () => close("Client disconnected"));

    // Return a function to send messages back to the client
    return (...args) => {
      socket.send(JSON.stringify(args));
    };

  }, {context: socket});
  
});
```
Client:
```typescript
import { RPCChannel } from "@flinbein/stateful-rpc";
import type { rpcSource } from "./backend";
// Connect to WebSocket server
const socket = new WebSocket("ws://localhost:8080");

// Create RPC channel
const rpc = new RPCChannel<typeof rpcSource>((send, close) => {
  // Handle incoming messages from the WebSocket
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    send(...message);
  };
  // Handle WebSocket closure
  socket.onclose = () => close("Connection closed");
  // Return a function to send messages to the server
  return (...args) => {
    socket.send(JSON.stringify(args));
  };
});

// Wait for the WebSocket to open before using the RPC channel
await new Promise(resolve => socket.onopen = resolve);

// Use the RPC channel
console.log(await rpc.ping()); // "pong"
console.log(await rpc.echo("Hello, World!")); // "Hello, World!"
```