import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";

describe("source-class-instance", {timeout: 1000}, () => {
	
	it("should call method of class with prefix", {timeout: 1000}, async () => {
		class RPCCalculator extends RPCSource<"$"> {
			constructor() {
				super("$"); // provide method prefix to avoid name conflicts
			}
			$sum(x: number, y: number) {
				return x + y;
			}
		}
		
		const rpcSource = new RPCCalculator();
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		assert.equal(await channel.sum(100, 200), 300, "should sum numbers");
	});
	
	it("should call method of class with bound prefix", {timeout: 1000}, async () => {
		class RPCCalculator extends RPCSource.with("$") {
			$sum(x: number, y: number) {
				return x + y;
			}
		}
		const rpcSource = new RPCCalculator();
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		assert.equal(await channel.sum(100, 200), 300, "should sum numbers");
	})
})