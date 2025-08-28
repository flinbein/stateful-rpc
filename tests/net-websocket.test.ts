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
		const websocketNames = new WeakMap<WebSocket, string>();
		const rpcSource = new RPCSource({
			setName: function(this: RPCSource, name: string) {
				websocketNames.set(this.channel.context, name);
			},
			getName: function(this: RPCSource) {
				return websocketNames.get(this.channel?.context);
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
		await channel1.setName("test-name-1");
		await channel2.setName("test-name-2");
		assert.equal(await channel1.getName(), "test-name-1", "should call getName method for channel1");
		assert.equal(await channel2.getName(), "test-name-2", "should call getName method for channel2");
		assert.equal(websocketNames.get(ws1.backend), "test-name-1", "websocketNames should have name for ws1");
		assert.equal(websocketNames.get(ws2.backend), "test-name-2", "websocketNames should have name for ws2");
	});
	
	it("should call method with context with class methods", {timeout: 500}, async () => {
		class TestSource extends RPCSource.with("$") {
			websocketNames = new WeakMap<WebSocket, string>();
			$setName(name: string) {
				(this as any).lastName = name;
				return this.innerSetName1(name);
			}
			innerSetName1(name: string){
				return this.innerSetName2(name);
			}
			innerSetName2(name: string){
				this.websocketNames.set(this.channel.context, name);
			}
		}
		const rpcSource = new TestSource();
		using ws = new WebSocketMock();
		ws.backend.open();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		assert.throws(
			() => rpcSource.channel,
			"should throw if channel is accessed in wrong context"
		)
		const channel = new RPCChannel<TestSource>(wsWrapper(ws));
		await channel.setName("test-name");
		assert.equal(rpcSource.websocketNames.get(ws.backend), "test-name", "websocketNames should have name for ws");
		assert.equal((rpcSource as any).lastName, "test-name", "lastName");
		assert.throws(
			() => rpcSource.innerSetName1("another-name"),
			"should throw if channel is accessed in wrong context"
		)
	})
	
	it("should call new instance as method ", {timeout: 500}, async () => {
		const websocketNames = new WeakMap<WebSocket, string>();
		class TestSource extends RPCSource.with("$") {
			
			$setName(name: string){
				websocketNames.set(this.channel.context, name);
			}
			$TextStore = class extends RPCSource.with("$")<string> {
				constructor() {
					const name = websocketNames.get(new.target.channel.context)
					super(`created by ${name}`);
				}
			}
		}
		const rpcSource = new TestSource();
		using ws = new WebSocketMock();
		ws.backend.open();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		const channel = new RPCChannel<TestSource>(wsWrapper(ws));
		await channel.setName("test-name");
		const store = new channel.TextStore();
		await store.promise;
		assert.equal(store.state, "created by test-name", "store should be set in constructor");
	})
	
	it("should close channel by method", {timeout: 500}, async () => {
		class TestSource extends RPCSource.with("$") {
			$closeMe(reason: string){
				this.channel.close(reason);
			}
		}
		const rpcSource = new TestSource();
		using ws = new WebSocketMock();
		ws.backend.open();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		const channel = new RPCChannel<TestSource>(wsWrapper(ws));
		await assert.rejects(
			channel.closeMe("test-close-reason"),
			(msg) => msg === "test-close-reason",
			"should reject with close reason"
		);
		assert.equal(channel.closed, true, "channel should be closed");
	})
	
	it("should dispose constructed RPCSource", {timeout: 500}, async () => {
		const websocketNames = new WeakMap<WebSocket, string>();
		let store = undefined as RPCSource<any, any> | undefined;
		class TestSource extends RPCSource.with("$") {
			$ping = () => "pong";
			$Store = class extends RPCSource.with({})<string> {
				constructor() {
					super(`test-store`);
					store = this;
				}
			}
		}
		const rpcSource = new TestSource();
		using ws = new WebSocketMock();
		ws.backend.open();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		const channel = new RPCChannel<TestSource>(wsWrapper(ws));
		const storeChannel = new channel.Store();
		await storeChannel.promise
		assert.equal(store!.disposed, false, "store should not be disposed");
		storeChannel.close("some-reason");
		await channel.ping();
		assert.equal(store!.disposed, true, "store should be disposed automatically");
	})
	
	it("should dispose constructed RPCSource", {timeout: 500}, async () => {
		const websocketNames = new WeakMap<WebSocket, string>();
		let store = undefined as RPCSource<any, any> | undefined;
		class TestSource extends RPCSource.with("$") {
			$ping = () => "pong";
			$Store = class extends RPCSource.with({})<string> {
				declare static autoClose: boolean;
				constructor() {
					new.target.autoClose = false;
					super(`test-store`);
					store = this;
				}
			}
		}
		const rpcSource = new TestSource();
		using ws = new WebSocketMock();
		ws.backend.open();
		RPCSource.start(rpcSource, wsWrapper(ws.backend), {context: ws.backend});
		const channel = new RPCChannel<TestSource>(wsWrapper(ws));
		const storeChannel = new channel.Store();
		await storeChannel.promise
		assert.equal(store!.disposed, false, "store should not be disposed");
		storeChannel.close("some-reason");
		await channel.ping();
		assert.equal(store!.disposed, false, "store should not be disposed automatically");
	})
})