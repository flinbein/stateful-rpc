import { WebSocketMock } from "../WebsocketMocks.js";

export default function (ws: WebSocket): (send: (...args: any[]) => void, close: (reason?: any) => void) => (...args: any[]) => void {
	if (ws.readyState === WebSocketMock.CLOSED || ws.readyState === WebSocketMock.CLOSING) {
		throw new Error("WebSocket is already in CLOSING or CLOSED state.");
	}
	return (send, close) => {
		ws.addEventListener("message", (event: MessageEvent) => {
			send(...JSON.parse(event.data));
		})
		ws.addEventListener("close", (event) => {
			close(event.reason);
		});
		ws.addEventListener("error", () => close("WebSocket error"));
		const openPromise = ws.readyState === WebSocketMock.OPEN ? Promise.resolve() : new Promise((resolve, reject) => {
			ws.addEventListener("open", resolve, {once: true});
			ws.addEventListener("error", reject, {once: true});
			ws.addEventListener("close", reject, {once: true});
		})
		openPromise.catch(() => {});
		return async (...args: any[]) => {
			if (ws.readyState !== WebSocketMock.OPEN) await openPromise;
			ws.send(JSON.stringify(args));
		}
	}
}
