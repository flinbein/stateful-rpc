import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import RPCChannel from "../src/RPCChannel.js";

describe("channel-from-source", {timeout: 1000}, () => {
	
	it("should create channel from source", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({
			setState: (data: string) => rpcSource.setState(data)
		}, "default-state");
		
		const channel1 = new RPCChannel(rpcSource);
		const channel2 = new RPCChannel(rpcSource);
		
		// skip awaiting initial state; it should be set immediately
		
		assert.equal(channel1.state, "default-state", "channel1 should get default state");
		assert.equal(channel2.state, "default-state", "channel2 should get default state");
		
		void channel1.setState("new-state"); // skip awaiting; it should be updated immediately
		
		assert.equal(channel1.state, "new-state", "channel1 should change state");
		assert.equal(channel2.state, "new-state", "channel2 should get updated state");
		
		void channel2.setState("other-state"); // skip awaiting; it should be updated immediately
		
		assert.equal(channel1.state, "other-state", "channel1 should get updated state");
		assert.equal(channel2.state, "other-state", "channel2 should change state");
	});
})