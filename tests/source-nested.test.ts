import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import { createChannelFactory } from "./createChannelFactory.js";

describe("source-nested", {timeout: 1000}, () => {
	
	it("should create channel by property with class", {timeout: 1000}, async () => {
		class RPC extends RPCSource.with("$") {
			$Nested = class extends RPCSource.with("$") {
				$ping() {
					return "pong"
				}
			}
		}
		const rpcSource = new RPC();
		const createChannel = createChannelFactory(rpcSource);
		const channel = createChannel();
		const nestedChannel = new channel.Nested();
		assert.equal(await nestedChannel.ping(), "pong", "should ping from nested class");
	});
	
	it("should create channel by property with instance", {timeout: 1000}, async () => {
		const innerSource = new RPCSource({ping: () => "pong"});
		class RPC extends RPCSource.with("$") {
			$Nested = innerSource;
		}
		
		const createChannel = createChannelFactory(new RPC());
		const channel = createChannel();
		const nestedChannel = new channel.Nested();
		assert.equal(await nestedChannel.ping(), "pong", "should ping from nested instance");
	})
	
	it("should create channel by property with promise of instance", {timeout: 1000}, async () => {
		const innerSource = new RPCSource({ping: () => "pong"});
		class RPC extends RPCSource.with("$") {
			$Nested = Promise.resolve(innerSource);
		}
		
		const createChannel = createChannelFactory(new RPC());
		const channel = createChannel();
		const nestedChannel = new channel.Nested();
		assert.equal(await nestedChannel.ping(), "pong", "should ping from nested instance");
	})
	
	it("should create channel by property with promise of instance", {timeout: 1000}, async () => {
		const innerSource = new RPCSource({ping: () => "pong"});
		class RPC extends RPCSource.with("$") {
			$Nested = async () => {
				return Promise.resolve(innerSource);
			}
			$aTest = async () => "test"
		}
		
		const createChannel = createChannelFactory(new RPC());
		const channel = createChannel();
		const nestedChannel = new channel.Nested();
		assert.equal(await nestedChannel.ping(), "pong", "should ping from nested instance");
	})
})