import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";

describe("source-channel", {timeout: 1000}, () => {
	
	it("should create channel by new RPCSource.Channel", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({
			ping: () => "pong",
		});
		const rpcMain = new RPCSource({
			Inner: () => {
				return new RPCSource.Channel(rpcSourceInner);
			}
		})
		const createChannel = createChannelFactory(rpcMain);
		const channel = createChannel();
		const innerChannel = new channel.Inner();
		assert.equal(await innerChannel.ping(), "pong", "should call ping");
	});
	
	it("should close sub-channel by client", {timeout: 1000}, async () => {
		let sourceChannel: RPCSource.Channel<any>;
		let sourceChannelReadyOnInit: boolean;
		let sourceChannelClosedOnInit: boolean;
		const sourceChannelCloseEvents: any[][] = [];
		const sourceChannelReadyEvents: any[][] = [];
		const rpcMain = new RPCSource({
			Inner: () => {
				sourceChannel = new RPCSource.Channel(new RPCSource({}));
				sourceChannel.on("ready", (...args: any[]) => sourceChannelReadyEvents.push(args));
				sourceChannelReadyOnInit = sourceChannel.ready;
				sourceChannelClosedOnInit = sourceChannel.closed;
				return sourceChannel;
			}
		})
		const createChannel = createChannelFactory(rpcMain);
		const channel = createChannel();
		const innerChannel = new channel.Inner();
		await innerChannel.promise;
		sourceChannel!.on("close", (...data) => sourceChannelCloseEvents.push(data));
		assert.equal(sourceChannelReadyOnInit!, false, "should not be ready on init");
		assert.equal(sourceChannelClosedOnInit!, false, "should not be closed on init");
		assert.equal(sourceChannel!.ready, true, "should be ready after init");
		assert.equal(sourceChannel!.closed, false, "should not be closed after init");
		innerChannel.close("reason");
		await new Promise(r => setImmediate(r));
		assert.equal(sourceChannel!.ready, false, "should not be ready after close");
		assert.equal(sourceChannel!.closed, true, "should be closed after close");
		assert.deepEqual(sourceChannelCloseEvents, [["reason"]], "should receive close event with reason");
		assert.deepEqual(sourceChannelReadyEvents, [[]], "should receive ready event once");
		assert.equal(channel.closed, false, "should not be closed after inner channel close");
	});
	
	it("should close sub-channel by server", {timeout: 1000}, async () => {
		let sourceChannel: RPCSource.Channel;
		let sourceChannelReadyOnInit: boolean;
		let sourceChannelClosedOnInit: boolean;
		const rpcMain = new RPCSource({
			Inner: () => {
				sourceChannel = new RPCSource.Channel(new RPCSource({}));
				sourceChannelReadyOnInit = sourceChannel.ready;
				sourceChannelClosedOnInit = sourceChannel.closed;
				return sourceChannel;
			}
		})
		const createChannel = createChannelFactory(rpcMain);
		const channel = createChannel();
		const innerChannel = new channel.Inner();
		await innerChannel.promise;
		assert.equal(sourceChannelReadyOnInit!, false, "should not be ready on init");
		assert.equal(sourceChannelClosedOnInit!, false, "should not be closed on init");
		assert.equal(sourceChannel!.ready, true, "should be ready after init");
		assert.equal(sourceChannel!.closed, false, "should not be closed after init");
		const closeReason = await new Promise(r => {
			innerChannel.once("close", r);
			sourceChannel!.close("reason");
		});
		assert.equal(closeReason, "reason", "should receive close reason");
		assert.equal(innerChannel.closed, true, "should be closed after source close");
		assert.equal(channel.closed, false, "should not be closed after inner channel close");
	});
	
	it("should emit to special channel only", {timeout: 1000}, async () => {
		const rpcMain = new class TestSource extends RPCSource.with("$", undefined)<{test: [string]}>{
			$testEmit(data: string) {
				this.channel.emit("test", data);
			}
		}
		const createChannel = createChannelFactory(rpcMain);
		const channel1TestEvents: any[] = [];
		const channel2TestEvents: any[] = [];
		const channel1 = createChannel();
		const channel2 = createChannel();
		channel1.on("test", (data) => channel1TestEvents.push(data));
		channel2.on("test", (data) => channel2TestEvents.push(data));
		await Promise.all([channel1.promise, channel2.promise]);
		rpcMain.emit("test","e1");
		await channel1.testEmit("e2");
		await channel2.testEmit("e3");
		rpcMain.emit("test","e4");
		await new Promise(r => setImmediate(r));
		assert.deepEqual(channel1TestEvents, ["e1","e2","e4"], "channel 1 should receive its and main events");
		assert.deepEqual(channel2TestEvents, ["e1","e3","e4"], "channel 2 should receive its and main events");
	});
	
	it("should reject used sourceChannel", {timeout: 1000}, async () => {
		const rpcInner = new RPCSource({test: () => "ok"});
		const sourceChannel = new RPCSource.Channel(rpcInner);
		const rpcMain = new RPCSource({
			Inner: () => sourceChannel
		})
		const createChannel = createChannelFactory(rpcMain);
		const channel = createChannel();
		const innerChannel1 = new channel.Inner();
		const innerChannel2 = new channel.Inner();
		await innerChannel1.promise;
		await assert.rejects(
			innerChannel2.promise,
			(err) => String(err).includes("already initialized"),
			"second channel creation should be rejected"
		);
	})
	
	it("should subscribe onCreateChannel", {timeout: 1000}, async () => {
		const rpcInner = new RPCSource({});
		const rpcMain = new RPCSource({Inner: () => rpcInner})
		const createChannelEvents: [RPCSource.Channel, RPCSource.Channel|undefined][] = []
		const createChannel = createChannelFactory(rpcMain, {
			onCreateChannel: (...args) => createChannelEvents.push(args)
		});
		const channel = createChannel();
		new channel.Inner();
		const innerChannel2 = new channel.Inner();
		await innerChannel2.promise;
		assert.equal(createChannelEvents.length, 3, "should call onCreateChannel three times");
		assert.equal(createChannelEvents[0][0].source, rpcMain, "first call with main channel");
		assert.equal(createChannelEvents[1][0].source, rpcInner, "second call with rpcInner channel");
		assert.equal(createChannelEvents[2][0].source, rpcInner, "third call with rpcInner channel");
		assert.equal(createChannelEvents[0][1], undefined, "first call parent is undefined");
		assert.equal(createChannelEvents[1][1], createChannelEvents[0][0], "second call parent is main channel");
		assert.equal(createChannelEvents[2][1], createChannelEvents[0][0], "third call parent is main channel");
	});
	
	it("should use channels limit", {timeout: 1000}, async () => {
		const rpcMain = new RPCSource({Inner: () => rpcMain})
		const createChannel = createChannelFactory(rpcMain, {
			maxChannelsPerClient: 3
		});
		const channel = createChannel(); // first channel, ok
		const c2 = new channel.Inner();
		const c3 = new channel.Inner();
		const c4 = new channel.Inner();
		const c5 = new channel.Inner();
		await Promise.allSettled([channel.promise, c2.promise, c3.promise, c4.promise, c5.promise]);
		assert.equal(c2.closed, false, "channel 2 should be created");
		assert.equal(c3.closed, false, "channel 3 should be created");
		assert.equal(c4.closed, true, "channel 4 should be closed");
		assert.equal(c5.closed, true, "channel 5 should be closed");
		await assert.rejects(
			c4.promise,
			err => String(err).includes("channels limit"),
			"channel 4 should be rejected"
		);
		await assert.rejects(
			c5.promise,
			err => String(err).includes("channels limit"),
			"channel 5 should be rejected"
		);
	});
})