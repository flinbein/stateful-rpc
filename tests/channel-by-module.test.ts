import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";
import * as Module from "./channel-by-module.module.js";

describe("channel-by-module", {timeout: 1000}, () => {
	
	it("should import module with functions", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource(Module);
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		assert.equal(await channel.ping(), "pong", "should call imported ping function");
		assert.equal(await channel.math.pow(5, 3), 125, "should call imported math.pow function");
	});
	
	it("should import module with classes", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource(Module);
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const store = new channel.Store("default-state");
		await store.promise;
		assert.equal(store.state, "default-state", "should create Store instance with initial state");
		assert.equal(await store.echo("test-echo"), "test-echo", "should call Store.echo method");
	});
	
})