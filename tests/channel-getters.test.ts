import * as assert from "node:assert";
import { describe, it } from "node:test";
import { createChannelFactory } from "./createChannelFactory.js";
import RPCSource from "../src/RPCSource.js"

describe("channel-getters", () => {
	
	it("should close the channel by backend with reason", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({});
		const abortController = new AbortController();
		const createChannel = createChannelFactory(rpcSource, abortController.signal);
		const channel = createChannel();
		abortController.abort("test-close-reason");
		await assert.rejects(
			channel.promise,
			(msg) => msg === "test-close-reason",
			"should reject with close reason"
		);
		assert.equal(channel.closed, true, "channel should be closed");
		assert.equal(channel.ready, false, "channel should not be ready");
	});
	
	it("should close the channel by dispose", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({});
		rpcSource.dispose("test-dispose-reason");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		await assert.rejects(
			channel.promise,
			(msg) => msg === "test-dispose-reason",
			"should reject with close reason"
		);
		assert.equal(channel.closed, true, "channel should be closed");
		assert.equal(channel.ready, false, "channel should not be ready");
	});
	
	it("should open channel", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		assert.equal(await channel.promise, channel, "promise should resolve to channel");
		assert.equal(channel.closed, false, "channel should not be closed");
		assert.equal(channel.ready, true, "channel should be ready");
	})
	
	it("inner channel should be rejected on ws close", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "innerState");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner});
		const abortController = new AbortController();
		const createChannel = createChannelFactory(rpcSource, abortController.signal);
		const channel = createChannel();
		const innerChannel1 = new channel.getInner();
		const innerChannel2 = new channel.getInner();
		abortController.abort("test-close-reason");
		await assert.rejects(
			innerChannel1.promise,
			(msg) => msg === "test-close-reason",
			"should reject with close reason"
		);
		await assert.rejects(
			innerChannel2.promise,
			(msg) => msg === "test-close-reason",
			"should reject with close reason"
		);
		assert.equal(innerChannel1.closed, true, "channel 1 should be closed");
		assert.equal(innerChannel1.ready, false, "channel 1 should not be ready");
		assert.equal(innerChannel2.closed, true, "channel 2 should be closed");
		assert.equal(innerChannel2.ready, false, "channel 2 should not be ready");
	});
	
	it("inner channel should be resolved", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "innerState");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel1 = new channel.getInner();
		const innerChannel2 = new channel.getInner();
		assert.equal(await innerChannel1.promise, innerChannel1, "promise 1 should resolve to channel");
		assert.equal(await innerChannel2.promise, innerChannel2, "promise 2 should resolve to channel");
		assert.equal(innerChannel1.closed, false, "channel 1 should not be closed");
		assert.equal(innerChannel1.ready, true, "channel 1 should be ready");
		assert.equal(innerChannel2.closed, false, "channel 2 should not be closed");
		assert.equal(innerChannel2.ready, true, "channel 2 should be ready");
	})
	
	it("inner channel should be rejected on rpcSourceInner dispose", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "innerState");
		rpcSourceInner.dispose("test-dispose-reason");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel1 = new channel.getInner();
		const innerChannel2 = new channel.getInner();
		await assert.rejects(
			innerChannel1.promise,
			(msg) => msg === "test-dispose-reason",
			"should reject with close reason"
		);
		await assert.rejects(
			innerChannel2.promise,
			(msg) => msg === "test-dispose-reason",
			"should reject with close reason"
		);
		assert.equal(innerChannel1.closed, true, "channel 1 should be closed");
		assert.equal(innerChannel1.ready, false, "channel 1 should not be ready");
		assert.equal(innerChannel2.closed, true, "channel 2 should be closed");
		assert.equal(innerChannel2.ready, false, "channel 2 should not be ready");
	})
})