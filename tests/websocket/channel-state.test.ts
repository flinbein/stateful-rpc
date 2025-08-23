import * as assert from "node:assert";
import { describe, it } from "node:test";
import { WebSocketMock } from "../WebsocketMocks.js"
import wsWrapper from "./wsWrapper.js"
import RPCChannel from "../../src/RPCChannel.js"
import RPCSource from "../../src/RPCSource.js"

describe("channel-state", () => {
	
	const getNextChannelId = ((id = 0) => () => id++)();
	
	function createRpcWebsocket<T extends RPCSource<any, any>>(rpcSource: T) {
		const ws = new WebSocketMock();
		RPCSource.start(rpcSource, wsWrapper(ws.backend));
		ws.backend.open();
		return ws;
	}
	
	it("should get default state", async () => {
		const rpcSource = new RPCSource({}, "default-state");
		using ws = createRpcWebsocket(rpcSource);
		const channel = new RPCChannel<typeof rpcSource>(wsWrapper(ws), {getNextChannelId});
		await channel.promise;
		assert.equal(channel.state, "default-state", "should get default state");
	});
	
	it("should change state", async () => {
		const rpcSource = new RPCSource({}, "default-state");
		using ws = createRpcWebsocket(rpcSource);
		const channel = new RPCChannel<typeof rpcSource>(wsWrapper(ws), {getNextChannelId});
		await channel.promise;
		assert.equal(channel.state, "default-state", "should get default state");
		await new Promise(resolve => {
			channel.once("state", resolve);
			rpcSource.setState("next-state");
		})
		assert.equal(channel.state, "next-state", "should change state");
	});
	
	it("inner, should get default state", async () => {
		const rpcSourceInner = new RPCSource({}, "default-inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner});
		using ws = createRpcWebsocket(rpcSource);
		const channel = new RPCChannel<typeof rpcSource>(wsWrapper(ws), {getNextChannelId});
		const innerChannel1 = new channel.getInner();
		const innerChannel2 = new channel.getInner();
		await Promise.all([innerChannel1.promise, innerChannel2.promise]);
		assert.equal(innerChannel1.state, "default-inner-state", "should get default inner state");
		assert.equal(innerChannel2.state, "default-inner-state", "should get default inner state");
	});
	
	it("inner, should change state", async () => {
		const rpcSourceInner = new RPCSource({}, "default-inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner});
		using ws = createRpcWebsocket(rpcSource);
		const channel = new RPCChannel<typeof rpcSource>(wsWrapper(ws), {getNextChannelId});
		const innerChannel1 = new channel.getInner();
		const innerChannel2 = new channel.getInner();
		await Promise.all([innerChannel1.promise, innerChannel2.promise]);
		assert.equal(innerChannel1.state, "default-inner-state", "should get default inner state");
		assert.equal(innerChannel2.state, "default-inner-state", "should get default inner state");
		await new Promise(resolve => {
			innerChannel2.once("state", resolve);
			rpcSourceInner.setState("next-inner-state");
		})
		assert.equal(innerChannel1.state, "next-inner-state", "should change inner state");
		assert.equal(innerChannel2.state, "next-inner-state", "should change inner state");
	});
	
})