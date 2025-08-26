import * as assert from "node:assert";
import { describe, it } from "node:test";
import wsWrapper from "./wsWrapper.js";
import { WebSocketMock } from "./WebsocketMocks.js";
import RPCSource from "../src/RPCSource.js"
import RPCChannel from "../src/RPCChannel.js"

describe("net-websocket", () => {
	
	it("should close the channel by backend with reason", {timeout: 10000}, async () => {
		const rpcSource = new RPCSource({});
		const ws = new WebSocketMock();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		const channel = new RPCChannel(wsWrapper(ws));
		ws.backend.close(4000, "test-close-reason");
		await assert.rejects(
			channel.promise,
			(msg) => msg === "test-close-reason",
			"should reject with close reason"
		);
	});
	
	it("should close the channel by client with reason", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({});
		const ws = new WebSocketMock();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		const channel = new RPCChannel(wsWrapper(ws));
		ws.close(4000, "test-close-reason");
		await assert.rejects(
			channel.promise,
			(msg) => msg === "test-close-reason",
			"should reject with close reason"
		);
	});
	
	it("should call method", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({ping: () => "pong"});
		const ws = new WebSocketMock();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		const channel = new RPCChannel<typeof rpcSource>(wsWrapper(ws));
		ws.backend.open();
		assert.equal(await channel.ping(), "pong", "should call ping method")
	});
	
	it("should call method with context", {timeout: 500}, async () => {
		const websocketNames = new WeakMap<WebSocketMock, string>();
		const rpcSource = new RPCSource({
			setName: function(this: WebSocketMock, name: string) {
				websocketNames.set(this, name);
			},
			getName: function(this: WebSocketMock) {
				return websocketNames.get(this);
			}
		});
		using ws1 = new WebSocketMock();
		using ws2 = new WebSocketMock();
		ws1.backend.open();
		ws2.backend.open();
		RPCSource.start(rpcSource, wsWrapper(ws1.backend), {context: ws1.backend});
		RPCSource.start(rpcSource, wsWrapper(ws2.backend), {context: ws2.backend});
		const channel1 = new RPCChannel<typeof rpcSource>(wsWrapper(ws1));
		const channel2 = new RPCChannel<typeof rpcSource>(wsWrapper(ws2));
		await channel1.promise;
		await channel2.promise;
		await channel1.setName("test-name-1");
		await channel2.setName("test-name-2");
		assert.equal(await channel1.getName(), "test-name-1", "should call getName method for channel1");
		assert.equal(await channel2.getName(), "test-name-2", "should call getName method for channel2");
	});
})