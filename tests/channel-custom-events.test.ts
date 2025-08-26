import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";

describe("channel-custom-events", () => {
	
	it("should subscribe on custom event", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state").withEventTypes<{
			blink: [color: string, duration: number]
		}>();
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const blinkEvents: [string, number][] = [];
		channel.on("blink", (...args) => blinkEvents.push(args))
		await channel.promise;
		rpcSource.emit("blink", "red", 500);
		rpcSource.emit("blink", "blue", 1000);
		await new Promise(resolve => setImmediate(resolve)); // wait for event loop
		assert.deepEqual(blinkEvents, [["red", 500], ["blue", 1000]], "should emit custom events");
	});
	
	it("should subscribe on event with complex path", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state").withEventTypes<{
			effect: {
				lightning: [intensity: number],
				sound: [soundName: string, volume: number],
			}
		}>();
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		
		const soundEvents: [string, number][] = [];
		const lightningEvents: [number][] = [];
		channel.effect.on("sound", (...args) => soundEvents.push(args))
		channel.effect.on("lightning", (...args) => lightningEvents.push(args))
		await channel.promise;
		rpcSource.emit(["effect", "sound"], "beep", 500);
		rpcSource.emit(["effect", "sound"], "kick", 1000);
		rpcSource.emit(["effect", "lightning"], 10);
		rpcSource.emit(["effect", "lightning"], 20);
		await new Promise(resolve => setImmediate(resolve)); // wait for event loop
		assert.deepEqual(soundEvents, [["beep", 500], ["kick", 1000]], "should emit sound events");
		assert.deepEqual(lightningEvents, [[10], [20]], "should emit lightning events");
	});
	
	it("should subscribe on event with complex name", {timeout: 1000}, async () => {
		const rpcSource = new RPCSource({}, "default-state").withEventTypes<{
			effect: {
				lightning: [intensity: number],
				sound: [soundName: string, volume: number],
			}
		}>();
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		
		const soundEvents: [string, number][] = [];
		const lightningEvents: [number][] = [];
		channel.on(["effect", "sound"], (...args) => soundEvents.push(args))
		channel.on(["effect","lightning"], (...args) => lightningEvents.push(args))
		await channel.promise;
		rpcSource.emit(["effect", "sound"], "beep", 500);
		rpcSource.emit(["effect", "sound"], "kick", 1000);
		rpcSource.emit(["effect", "lightning"], 10);
		rpcSource.emit(["effect", "lightning"], 20);
		await new Promise(resolve => setImmediate(resolve)); // wait for event loop
		assert.deepEqual(soundEvents, [["beep", 500], ["kick", 1000]], "should emit sound events");
		assert.deepEqual(lightningEvents, [[10], [20]], "should emit lightning events");
	})
	
	it("nested: should subscribe on custom event", {timeout: 1000}, async () => {
		const innerRpcSource = new RPCSource({}, "default-state").withEventTypes<{
			blink: [color: string, duration: number]
		}>();
		const rpcSource = new RPCSource({getInner: () => innerRpcSource}, "default-state");
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const innerChannel1 = new channel.getInner();
		const innerChannel2 = new channel.getInner();
		const blinkEvents1: [string, number][] = [];
		const blinkEvents2: [string, number][] = [];
		innerChannel1.on("blink", (...args) => blinkEvents1.push(args))
		innerChannel2.on("blink", (...args) => blinkEvents2.push(args))
		await channel.promise;
		innerRpcSource.emit("blink", "red", 500);
		innerRpcSource.emit("blink", "blue", 1000);
		await new Promise(resolve => setImmediate(resolve)); // wait for event loop
		assert.deepEqual(blinkEvents1, [["red", 500], ["blue", 1000]], "channel 1 should emit custom events");
		assert.deepEqual(blinkEvents2, [["red", 500], ["blue", 1000]], "channel 2 should emit custom events");
	});
})