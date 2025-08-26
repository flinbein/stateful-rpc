import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";

describe("channel-methods", {timeout: 1000}, () => {
	
	it("should call method", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({
			sum: (x: number, y: number) => x + y
		});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		assert.equal(await channel.sum(100, 200), 300, "should sum numbers");
	});
	
	it("should notify method", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({
			ping: () => "pong",
			setState: (value: string) => void rpcSource.setState(() => value)
		}, "");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const notifyResult = channel.setState.notify("newState");
		assert.equal(notifyResult, undefined, "notify should return undefined");
		await channel.ping(); // wait for notify to be processed
		assert.equal(await channel.state, "newState", "state should be updated");
	});
	
	it("should receive error", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({
			badMethod: () => {
				throw "error";
			}
		});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		await assert.rejects(
			channel.badMethod(),
			(msg) => msg === "error",
			"should receive error from badMethod"
		);
	});
	
	it("should call complex method", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({
			math: {
				sum: (x: number, y: number) => x + y
			}
		});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		assert.equal(await channel.math.sum(100, 200), 300, "should sum numbers");
	})
	
	it("nested: should call complex method", {timeout: 1000}, async () => {
		const mathRpcSource = new RPCSource({
			math: {
				sum: (x: number, y: number) => x + y
			}
		});
		const rpcSource = new RPCSource({
			calculator: () => mathRpcSource
		});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const calculatorChannel = new channel.calculator();
		assert.equal(await calculatorChannel.math.sum(100, 200), 300, "should sum numbers");
	})
})