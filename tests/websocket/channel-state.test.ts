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
		const ws = createRpcWebsocket(rpcSource);
		using channel = new RPCChannel<typeof rpcSource>(wsWrapper(ws), {getNextChannelId});
		await channel.promise;
		assert.equal(channel.state, "default-state", "should get default state");
	});
	
})