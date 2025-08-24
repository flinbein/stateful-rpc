import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import RPCChannel from "../src/RPCChannel.js"

describe("net-messageport", {timeout: 100}, () => {
	
	function messagePortMapper(mp: MessagePort): (send: (...args: any[]) => void, close: (reason?: any) => void) => (...args: any[]) => void {
		return (send) => {
			mp.addEventListener("message", (event: MessageEvent) => {
				send(...event.data);
			})
			mp.start();
			return async (...args: any[]) => {
				mp.postMessage(args);
			}
		}
	}
	
	it("should call method", {timeout: 100}, async () => {
		const rpcSource = new RPCSource({ping: () => "pong"});
		const mc = new MessageChannel();
		RPCSource.start(rpcSource, messagePortMapper(mc.port1));
		const channel = new RPCChannel<typeof rpcSource>(messagePortMapper(mc.port2));
		assert.equal(await channel.ping(), "pong", "should call ping method");
		mc.port1.close();
		mc.port2.close();
	});
})