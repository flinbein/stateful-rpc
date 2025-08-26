import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCChannel from "../src/RPCChannel.js";
import { REMOTE_ACTION } from "../src/contract.js";

describe("channel-connectionTimeout", () => {
	
	it("should create channel", {timeout: 1000}, async (t) => {
		t.mock.timers.enable({apis: ["setTimeout", "setInterval"]})
		const channel = new RPCChannel(
			(send) => (...args) => {
				setTimeout(() => {
					send([args[0]], REMOTE_ACTION.STATE, true)
				}, 300)
			},
			{connectionTimeout: 500}
		);
		
		assert.equal(channel.ready, false, "channel should not be ready yet");
		assert.equal(channel.closed, false, "channel should not be closed yet");
		t.mock.timers.tick(100)
		assert.equal(channel.ready, false, "channel should not be ready after 100ms");
		assert.equal(channel.closed, false, "channel should not be closed after 100ms");
		t.mock.timers.tick(300)
		assert.equal(channel.ready, true, "channel should be ready now");
		t.mock.timers.tick(200)
		assert.equal(channel.ready, true, "channel should be ready");
	});
	
	it("should not create channel", {timeout: 1000}, async (t) => {
		t.mock.timers.enable({apis: ["setTimeout", "setInterval"]})
		const channel = new RPCChannel(
			() => () => {},
			{connectionTimeout: 500}
		);
		
		assert.equal(channel.ready, false, "channel should not be ready yet");
		assert.equal(channel.closed, false, "channel should not be closed yet");
		t.mock.timers.tick(200);
		assert.equal(channel.ready, false, "channel should not be ready after 100ms");
		assert.equal(channel.closed, false, "channel should not be closed after 100ms");
		t.mock.timers.tick(600);
		assert.equal(channel.closed, true, "channel should be closed");
		t.mock.timers.reset();
		await assert.rejects(channel.promise, "Channel was not established in time")
	})
	
	it("should create channel with abort controller", {timeout: 1000}, async (t) => {
		t.mock.timers.enable({apis: ["setTimeout", "setInterval"]});
		const abortController = new AbortController();
		const channel = new RPCChannel(
			(send) => (...args) => {
				setTimeout(() => {
					send([args[0]], REMOTE_ACTION.STATE, true)
				}, 300)
			},
			{connectionTimeout: abortController.signal}
		);
		
		assert.equal(channel.ready, false, "channel should not be ready yet");
		assert.equal(channel.closed, false, "channel should not be closed yet");
		t.mock.timers.tick(100)
		assert.equal(channel.ready, false, "channel should not be ready after 100ms");
		assert.equal(channel.closed, false, "channel should not be closed after 100ms");
		t.mock.timers.tick(300)
		assert.equal(channel.ready, true, "channel should be ready now");
		abortController.abort("test abort");
		assert.equal(channel.ready, true, "channel should be ready after abort");
	});
	
	it("should not create channel with abort controller", {timeout: 1000}, async (t) => {
		t.mock.timers.enable({apis: ["setTimeout", "setInterval"]});
		const abortController = new AbortController();
		const channel = new RPCChannel(
			() => () => {},
			{connectionTimeout: abortController.signal}
		);
		
		assert.equal(channel.ready, false, "channel should not be ready yet");
		assert.equal(channel.closed, false, "channel should not be closed yet");
		abortController.abort("test abort");
		assert.equal(channel.ready, false, "channel should not be ready yet");
		assert.equal(channel.closed, true, "channel should be closed");
		t.mock.timers.reset();
		await assert.rejects(
			channel.promise,
			(message) => message === "test abort",
			"Channel was not established in time"
		)
	})
	
})