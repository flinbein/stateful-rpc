import * as assert from "node:assert";
import { describe, it } from "node:test";
import RPCSource from "../src/RPCSource.js"
import * as z from "zod";
import { createChannelFactory } from "./createChannelFactory.js";

describe("source-validate", {timeout: 1000}, () => {
	
	it("should validate methods with zod", {timeout: 1000}, async () => {
		const validateSize = z.tuple([
			z.number().int().min(0),
			z.literal(["px", "em", "%"]).optional()
		]).parse
		const rpc = new RPCSource({
			setSize: RPCSource.validate(validateSize, function(this, size, units = "px") {
				return this.setState(`${size}${units}`);
			})
		}, "0px");
		const createChannel = createChannelFactory(rpc);
		const channel = createChannel();
		assert.equal(await channel.setSize(100), "100px", "should set size with default units");
		assert.equal(await channel.setSize(5, "em"), "5em", "should set size with em units");
		assert.equal(channel.state, "5em", "should change state");
		await assert.rejects(
			channel.setSize(-5, "em"),
			err => String(err).includes("Too small"),
			"should validate size min value"
		);
		await assert.rejects(
			channel.setSize(5, "unknown"  as any),
			err => String(err).includes("Invalid option"),
			"should validate units"
		);
		await assert.rejects(
			(channel as any).setSize(5, "em", "extra"),
			err => String(err).includes("Too big"),
			"should validate argument count"
		);
		await assert.rejects(
			channel.setSize("large" as any),
			err => String(err).includes("Invalid input"),
			"should validate argument type"
		);
		await assert.rejects(
			(channel as any).setSize(),
			err => String(err).includes("Invalid input"),
			"should validate argument count"
		);
		
	});
	
	it("should validate methods", {timeout: 1000}, async () => {
		function allAreNumbers(params: unknown[]): params is number[] {
			return params.every(arg => typeof arg === "number");
		}
		function allToNumbers(params: unknown[]): number[] {
			return params.map(arg => Number(arg));
		}
		const rpc = new RPCSource({
			sum: RPCSource.validate(allAreNumbers, function(this, ...params) {
				return params.reduce((a, b) => a + b, 0);
			}),
			sum2: RPCSource.validate(allToNumbers, function(this, ...params) {
				return params.reduce((a, b) => a + b, 0);
			})
		}, "0px");
		const createChannel = createChannelFactory(rpc);
		const channel = createChannel();
		assert.equal(await channel.sum(1, 2, 3), 6, "should sum numbers");
		assert.equal(await channel.sum2(1, "2" as any, 3), 6, "should sum mixed values as numbers");
		await assert.rejects(
			channel.sum(1, "2" as any, 3),
			err => String(err).includes("invalid parameters"),
			"should validate argument types"
		);
	})
})