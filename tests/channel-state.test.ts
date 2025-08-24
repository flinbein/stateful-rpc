import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";

describe("channel-state", {timeout: 100}, () => {
	
	it("should get default state", {timeout: 100}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		await channel.promise;
		assert.equal(channel.state, "default-state", "should get default state");
	});
	
	it("should share state between connections", {timeout: 100}, async () => {
		const rpcSource = new RPCSource({
			setState: (value: string) => void rpcSource.setState(value)
		}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel1 = createChannel();
		const channel2 = createChannel();
		await channel1.promise;
		await channel2.promise;
		await channel1.setState("new-state");
		assert.equal(channel2.state, "new-state", "should share state between channels");
	});
	
	it("should share state between channels", {timeout: 100}, async () => {
		const rpcSource = new RPCSource({
			setState: (value: string) => void rpcSource.setState(value)
		}, "default-state");
		const createChannel1 = createChannelFactory(rpcSource);
		const channel1 = createChannel1();
		const createChannel2 = createChannelFactory(rpcSource);
		const channel2 = createChannel2();
		await channel1.promise;
		await channel2.promise;
		await channel1.setState("new-state");
		assert.equal(channel2.state, "new-state", "should share state between channels");
	});
	
	it("should change state", {timeout: 100}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		await channel.promise;
		assert.equal(channel.state, "default-state", "should get default state");
		await new Promise(resolve => {
			channel.once("state", resolve);
			rpcSource.setState("next-state");
		})
		assert.equal(channel.state, "next-state", "should change state");
	});
	
	it("inner, should get default state", {timeout: 100}, async () => {
		const rpcSourceInner = new RPCSource({}, "default-inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel1 = new channel.getInner();
		const innerChannel2 = new channel.getInner();
		await Promise.all([innerChannel1.promise, innerChannel2.promise]);
		assert.equal(innerChannel1.state, "default-inner-state", "should get default inner state");
		assert.equal(innerChannel2.state, "default-inner-state", "should get default inner state");
	});
	
	it("inner, should change state", {timeout: 100}, async () => {
		const rpcSourceInner = new RPCSource({}, "default-inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner});
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
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