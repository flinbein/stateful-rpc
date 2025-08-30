import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js"
import { REMOTE_ACTION, CLIENT_ACTION } from "../src/contract.js";

describe("source-security", {timeout: 1000}, () => {
	
	it("should prevent some methods", {timeout: 1000}, async () => {
		const rpcSource = new class extends RPCSource.with("$") {
			$ping = () => "pong";
			$math = {
				floor: Math.floor
			};
			$Nested = class extends RPCSource.with("$", undefined) {}
		}
		let callMethod: (path: any[], ...args: any) => Promise<any>;
		RPCSource.start(rpcSource, (send) => {
			let callId = 0;
			const channelId = 0;
			send(channelId);
			const resMap = new Map<number, PromiseWithResolvers<any>>();
			callMethod = (path, ...args) => {
				const id = ++callId;
				const pwr = Promise.withResolvers();
				resMap.set(id, pwr);
				send(channelId, CLIENT_ACTION.CALL, id, path, args);
				return pwr.promise;
			};
			
			return (_channelId, remoteAction, ...args ) => {
				if (remoteAction === REMOTE_ACTION.RESPONSE_OK || remoteAction === REMOTE_ACTION.RESPONSE_ERROR) {
					const [id, value] = args;
					const res = resMap.get(id);
					res?.[remoteAction === REMOTE_ACTION.RESPONSE_OK ? "resolve" : "reject"]?.(value);
					resMap.delete(id);
				}
			}
		});
		assert.equal(await callMethod!(["ping"]), "pong", "ping works");
		await assert.rejects(
			callMethod!([]),
			err => String(err).includes("wrong path"),
			"empty method is not available"
		);
		await assert.rejects(
			callMethod!(["setState"]),
			err => String(err).includes("wrong path"),
			"setState is not available"
		);
		await assert.rejects(
			callMethod!(["dispose"]),
			err => String(err).includes("wrong path"),
			"dispose is not available"
		);
		await assert.rejects(
			callMethod!(["constructor"]),
			err => String(err).includes("wrong path"),
			"constructor is not available"
		);
		await assert.rejects(
			callMethod!(["__proto__"]),
			err => String(err).includes("wrong path"),
			"__proto__ is not available"
		);
		await assert.rejects(
			callMethod!(["__proto__", "constructor"]),
			err => String(err).includes("wrong path"),
			"__proto__.constructor is not available"
		);
		await assert.rejects(
			callMethod!(["__defineGetter__"]),
			err => String(err).includes("wrong path"),
			"__defineGetter__ is not available"
		);
		await assert.rejects(
			callMethod!(["__defineSetter__"]),
			err => String(err).includes("wrong path"),
			"__defineGetter__ is not available"
		);
		await assert.rejects(
			callMethod!(["__lookupGetter__"]),
			err => String(err).includes("wrong path"),
			"__lookupGetter__ is not available"
		);
		await assert.rejects(
			callMethod!(["__lookupSetter__"]),
			err => String(err).includes("wrong path"),
			"__lookupSetter__ is not available"
		);
		await assert.rejects(
			callMethod!(["ping", "constructor"]),
			err => String(err).includes("wrong path"),
			"ping.constructor is not available"
		);
		await assert.rejects(
			callMethod!(["ping", "__proto__"]),
			err => String(err).includes("wrong path"),
			"ping.__proto__ is not available"
		);
		await assert.rejects(
			callMethod!(["ping", "__proto__", "constructor"]),
			err => String(err).includes("wrong path"),
			"ping.__proto__.constructor is not available"
		);
		await assert.rejects(
			callMethod!(["ping", "constructor"]),
			err => String(err).includes("wrong path"),
			"ping.constructor is not available"
		);
		await assert.rejects(
			callMethod!(["ping", "call"]),
			err => String(err).includes("wrong path"),
			"ping.call is not available"
		);
		
		await assert.rejects(
			callMethod!(["math", "__proto__"]),
			err => String(err).includes("wrong path"),
			"math.__proto__ is not available"
		);
		
		await assert.rejects(
			callMethod!(["math", "__proto__", "constructor"]),
			err => String(err).includes("wrong path"),
			"math.__proto__.constructor is not available"
		);
		
		await assert.rejects(
			callMethod!(["math", "constructor"], 1000),
			err => String(err).includes("wrong path"),
			"math.constructor is not available"
		);
		
		await assert.rejects(
			callMethod!(["promisedMethod", "then"]),
			err => String(err).includes("wrong path"),
			"promisedMethod.then is not available"
		);
		
		await assert.rejects(
			callMethod!(["Nested"]),
			err => String(err).includes("cannot be invoked"),
			"Nested is not available"
		);
		
		await assert.rejects(
			callMethod!(["Nested", "with"]),
			err => String(err).includes("wrong path"),
			"Nested.with is not available"
		);
		
		await assert.rejects(
			callMethod!(["Nested", "constructor"]),
			err => String(err).includes("wrong path"),
			"Nested.constructor is not available"
		);
		
		await assert.rejects(
			callMethod!(["Nested", "prototype"]),
			err => String(err).includes("wrong path"),
			"Nested.prototype is not available"
		);
	});
	
	it("should block repeated channelId for channel", {timeout: 1000}, async () => {
		const rpcInner = new RPCSource({}, "inner");
		const rpcMain = new RPCSource({Inner: () => rpcInner}, "main")
		let nextId: string;
		// Simulate an attack by re-using a channel ID
		const createChannel = createChannelFactory(rpcMain);
		nextId = "1"
		const channel1 = createChannel({
			getNextChannelId: () => nextId
		});
		await channel1.promise; // channel created with id = "1";
		nextId = "2";
		const subChannel = new channel1.Inner();
		await subChannel.promise; // sub-channel created with id = "2";
		const channel2 = createChannel({
			getNextChannelId: () => nextId
		}); // channel created with id = "2" - re-used ID
		
		await assert.rejects(
			channel2.promise,
			err => String(err).includes("channel id conflict"),
			"second channel with re-used ID should be rejected"
		);
		assert.equal(subChannel.closed, true, "all channels wth id = '2' should be closed");
		assert.equal(channel1.closed, false, "main channel should be ok");
	})
})