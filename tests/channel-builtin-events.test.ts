import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";

// tests for built-in events: 'ready', 'error', 'close', 'state'
describe("channel-builtin-events", () => {
	
	it("should emit 'ready' event on init", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		let readyEventData: any[] | undefined;
		channel.on("ready", (...args) => readyEventData = args);
		await Promise.allSettled([channel.promise]);
		assert.deepEqual(readyEventData, [], "'ready' event should be emitted with no arguments");
	});
	
	it("should emit 'error' and 'close' on failure (connection closed before established)", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const abortController = new AbortController();
		const createChannel = createChannelFactory(rpcSource, abortController.signal);
		const channel = createChannel();
		let closeEventData: any[] | undefined;
		channel.on("close", (...args) => closeEventData = args);
		let errorEventData: any[] | undefined;
		channel.on("error", (...args) => errorEventData = args);
		abortController.abort("test-close-reason");
		await Promise.allSettled([channel.promise]);
		assert.deepEqual(closeEventData, ["test-close-reason"], "'close' event should be emitted with close reason");
		assert.deepEqual(errorEventData, ["test-close-reason"], "'error' event should be emitted with close reason");
	});
	
	it("should emit 'error' and 'close' on failure (disposed)", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		rpcSource.dispose("test-disposed");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		let closeEventData: any[] | undefined;
		channel.on("close", (...args) => closeEventData = args);
		let errorEventData: any[] | undefined;
		channel.on("error", (...args) => errorEventData = args);
		await Promise.allSettled([channel.promise]);
		assert.deepEqual(closeEventData, ["test-disposed"], "'close' event should be emitted with close reason");
		assert.deepEqual(errorEventData, ["test-disposed"], "'error' event should be emitted with close reason");
	});
	
	it("should emit 'close' on normal closing", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const abortController = new AbortController();
		const createChannel = createChannelFactory(rpcSource, abortController.signal);
		const channel = createChannel();
		await channel.promise;
		const closeEventData = await new Promise<any[]>(resolve => {
			channel.on("close", (...args) => resolve(args));
			abortController.abort("test-close-reason");
		});
		assert.deepEqual(closeEventData, ["test-close-reason"], "'close' event should be emitted with close reason");
	});
	
	it("should emit 'close' on normal dispose", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		await channel.promise;
		const closeEventData = await new Promise<any[]>(resolve => {
			channel.on("close", (...args) => resolve(args));
			rpcSource.dispose("test-dispose-reason")
		});
		assert.deepEqual(closeEventData, ["test-dispose-reason"], "'close' event should be emitted with close reason");
	});
	
	it("should not emit 'error' on normal closing", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const abortController = new AbortController();
		const createChannel = createChannelFactory(rpcSource, abortController.signal);
		const channel = createChannel();
		let errorEmitted = false;
		channel.on("error", () => errorEmitted = true);
		await channel.promise;
		await new Promise<any>(resolve => {
			channel.on("close", resolve);
			abortController.abort("test-close-reason");
		}); // Wait for close event
		await new Promise(r => setImmediate(r)); // Ensure no error event is emitted after close
		assert.equal(errorEmitted, false, "'error' event should not be emitted on close");
	});
	
	it("should emit 'state' event on init", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		let stateEventData: any[] | undefined;
		channel.on("state", (...args) => stateEventData = args);
		await Promise.allSettled([channel.promise]);
		assert.deepEqual(stateEventData, ["default-state"], "'state' event should be emitted with initial state");
	});
	
	it("should emit 'state' event on state changed", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "first-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		await Promise.allSettled([channel.promise]);
		let stateEventData: any[] = await new Promise<any>(resolve => {
			channel.on("state", (...args) => resolve(args));
			rpcSource.setState("new-state");
		}); // Wait for state event
		assert.deepEqual(stateEventData, ["new-state", "first-state"], "'state' event should be emitted with new state and previous state");
	});
	
	it("nested: should emit 'ready' event on init", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		let readyEventData: any[] | undefined;
		channel.on("ready", (...args) => readyEventData = args);
		await Promise.allSettled([innerChannel.promise]);
		assert.deepEqual(readyEventData, [], "'ready' event should be emitted with no arguments");
	});
	
	it("nested: should emit 'error' and 'close' on failure (connection closed before established)", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		const abortController = new AbortController();
		const createChannel = createChannelFactory(rpcSource, abortController.signal);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		let closeEventData: any[] | undefined;
		innerChannel.on("close", (...args) => closeEventData = args);
		let errorEventData: any[] | undefined;
		innerChannel.on("error", (...args) => errorEventData = args);
		abortController.abort("test-close-reason");
		await Promise.allSettled([innerChannel.promise]);
		assert.deepEqual(closeEventData, ["test-close-reason"], "'close' event should be emitted with close reason");
		assert.deepEqual(errorEventData, ["test-close-reason"], "'error' event should be emitted with close reason");
	});
	
	it("nested: should emit 'error' and 'close' on failure (disposed)", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		rpcSourceInner.dispose("test-disposed");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		let closeEventData: any[] | undefined;
		innerChannel.on("close", (...args) => closeEventData = args);
		let errorEventData: any[] | undefined;
		innerChannel.on("error", (...args) => errorEventData = args);
		await Promise.allSettled([innerChannel.promise]);
		assert.deepEqual(closeEventData, ["test-disposed"], "'close' event should be emitted with close reason");
		assert.deepEqual(errorEventData, ["test-disposed"], "'error' event should be emitted with close reason");
	});
	
	it("nested: should emit 'close' on normal dispose", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		await innerChannel.promise;
		const closeEventData = await new Promise<any[]>(resolve => {
			innerChannel.on("close", (...args) => resolve(args));
			rpcSourceInner.dispose("test-dispose-reason")
		});
		assert.deepEqual(closeEventData, ["test-dispose-reason"], "'close' event should be emitted with dispose reason");
		assert.equal(channel.ready, true, "outer channel should remain open when inner channel is disposed");
	});
	
	it("nested: should not emit 'close' on parent disposed", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		await innerChannel.promise;
		let innerCloseEventEmitted = false;
		innerChannel.on("close", () => innerCloseEventEmitted = true);
		await new Promise<any[]>(resolve => {
			channel.on("close", (...args) => resolve(args));
			rpcSource.dispose("test-dispose-reason");
		});
		assert.equal(innerCloseEventEmitted, false, "'close' event should not be emitted on inner channel when parent is disposed");
		assert.equal(channel.ready, false, "outer channel should be closed when parent is disposed");
		assert.equal(innerChannel.ready, true, "inner channel should remain open when parent is disposed");
		
	});
	
	it("nested: should not emit 'error' on normal closing", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		const abortController = new AbortController();
		const createChannel = createChannelFactory(rpcSource, abortController.signal);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		let errorEmitted = false;
		innerChannel.on("error", () => errorEmitted = true);
		await innerChannel.promise;
		await new Promise<any>(resolve => {
			innerChannel.on("close", resolve);
			abortController.abort("test-close-reason");
		}); // Wait for close event
		await new Promise(r => setImmediate(r)); // Ensure no error event is emitted after close
		assert.equal(errorEmitted, false, "'error' event should not be emitted on close");
	});
	
	it("nested: should emit 'state' event on init", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		let stateEventData: any[] | undefined;
		innerChannel.on("state", (...args) => stateEventData = args);
		await Promise.allSettled([innerChannel.promise]);
		assert.deepEqual(stateEventData, ["inner-state"], "'state' event should be emitted with initial state");
	});
	
	it("should emit 'state' event on state changed", {timeout: 1000}, async () => {
		const rpcSourceInner = new RPCSource({}, "first-inner-state");
		const rpcSource = new RPCSource({getInner: () => rpcSourceInner}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel = new channel.getInner();
		await Promise.allSettled([innerChannel.promise]);
		let stateEventData: any[] = await new Promise<any>(resolve => {
			innerChannel.on("state", (...args) => resolve(args));
			rpcSourceInner.setState("new-inner-state");
		}); // Wait for state event
		assert.deepEqual(stateEventData, ["new-inner-state", "first-inner-state"], "'state' event should be emitted with new state and previous state");
	});
	
})