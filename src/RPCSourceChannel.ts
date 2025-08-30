import EventEmitter from "./EventEmitter.js";
import type { RPCSource } from "./index.js";
import { registerAccessor, RPCSourceChannelInitData } from "./RPCSourceChannelAccessor.js"
import { REMOTE_ACTION } from "./contract.js";
import type { MetaScope, EventPathArgs, EventPath } from "./type-utils.js";

type RPCSourceChannelEvents = {
	ready: [];
	error: [reason?: any];
	close: [reason?: any];
}
export default class RPCSourceChannel<S = RPCSource<any, any>> {
	readonly #source: RPCSource<any,any, any>;
	#closed: boolean = false;
	#closeReason: any;
	#ready: boolean = false;
	#resolver = Promise.withResolvers<any>()
	#events = new EventEmitter<RPCSourceChannelEvents>();
	
	#initData: RPCSourceChannelInitData | undefined;
	
	declare public [Symbol.unscopables]: S extends MetaScope ? S[typeof Symbol.unscopables] : never
	
	#init = (initData: RPCSourceChannelInitData) => {
		this.#initData = initData;
		const {channelId, sendMessage, channels, subscribers, disposeReason} = initData;
		const onSourceStateChanged = this.#onSourceStateChanged;
		const onSourceMessage = this.#onSourceMessage;
		const onSourceDispose = this.#onSourceDispose;
		const eventEmitter = initData.getEventEmitter();
		const rpcSource = this.#source;
		if (rpcSource.disposed) this.close(disposeReason);
		if (this.#closed) return false;
		
		if (subscribers.has(rpcSource)) {
			subscribers.get(rpcSource)?.push(channelId);
		} else {
			const subscribedChannelsList = [channelId];
			subscribers.set(rpcSource, subscribedChannelsList);
			eventEmitter.on("message", onSourceMessage);
			eventEmitter.on("state", onSourceStateChanged);
			eventEmitter.on("dispose", onSourceDispose);
		}
		channels.set(channelId, this);
		try {
			sendMessage([channelId], REMOTE_ACTION.STATE, rpcSource.state);
		} catch {
			try {
				sendMessage([channelId], REMOTE_ACTION.STATE, new Error("state parse error"));
			} catch {}
		}
		this.#ready = true;
		this.#events.emit("ready");
		this.#resolver.resolve(this);
		return true;
	}
	
	#onSourceStateChanged = (state: any) => {
		const subscribedChannels = this.#initData?.subscribers?.get(this.#source);
		if (subscribedChannels) try {
			this.#initData?.sendMessage(subscribedChannels, REMOTE_ACTION.STATE, state);
		} catch {
			try {
				this.#initData?.sendMessage(subscribedChannels, REMOTE_ACTION.STATE, new Error("state parse error"));
			} catch {}
		}
	}
	
	#onSourceMessage = (path: (string|number)[], args: any[]) => {
		const subscribedChannels = this.#initData?.subscribers?.get(this.#source);
		if (subscribedChannels) try {
			this.#initData?.sendMessage(subscribedChannels, REMOTE_ACTION.EVENT, path, args);
		} catch {}
	}
	
	#onSourceDispose = (disposeReason: any) => {
		const subscribedChannels = this.#initData?.subscribers?.get(this.#source);
		if (subscribedChannels) {
			try {
				this.#initData?.sendMessage(subscribedChannels, REMOTE_ACTION.CLOSE, disposeReason);
			} catch {}
			for (let subscribedChannel of subscribedChannels) {
				this.#initData?.channels.delete(subscribedChannel)
			}
		}
		this.#initData?.subscribers.delete(this.#source);
		this.#cleanup();
	}
	
	#cleanup = () => {
		if (!this.#initData) return;
		const eventEmitter = this.#initData?.getEventEmitter();
		eventEmitter?.off("message", this.#onSourceMessage);
		eventEmitter?.off("state", this.#onSourceStateChanged);
		eventEmitter?.off("dispose", this.#onSourceDispose);
	}
	
	
	constructor(source: S & RPCSource<any,any,any>) {
		this.#resolver.promise.catch(() => {});
		this.#source = source;
		registerAccessor(this as any, {init: this.#init});
	}
	
	get promise(): Promise<this> {return this.#resolver.promise}
	get context() {return this.#initData?.context}
	
	/**
	 * channel is ready
	 */
	get ready() {return this.#ready}
	/**
	 * channel is closed
	 */
	get closed() {return this.#closed}
	/**
	 * get rpc source
	 */
	get source(): S {return this.#source as any;}
	
	/**
	 * Emit event for current connection.
	 * Reserved event names: `close`, `init`, `error`, `state`
	 * @param event path for event. String or array of strings.
	 * @param args event values
	 */
	declare emit: S extends MetaScope<any, infer EVENTS> ? (
		<P extends 0 extends (1&EVENTS) ? (string|number|(string|number)[]) : EventPath<EVENTS>>(
			event: P,
			...args: 0 extends (1&EVENTS) ? any[] : EventPathArgs<P, EVENTS>
		) => this
	) : never;
	
	["emit" as never](
		event: string | number | (string|number)[],
		...args: any[]
	): this{
		if (this.#closed) throw new Error("closed");
		const path: (string|number)[] = (typeof event === "string" || typeof event === "number") ? [event] : event;
		try {
			this.#initData?.sendMessage([this.#initData.channelId], REMOTE_ACTION.EVENT, path, args);
		} catch {}
		return this;
	}
	
	/**
	 * close this communication channel
	 * @param reason
	 */
	close(reason?: any){
		if (this.#closed) return;
		this.#closeReason = reason;
		this.#closed = true;
		const wasReady = this.#ready;
		this.#ready = false;
		if (wasReady) this.#events.emit("error", reason);
		this.#events.emit("close", reason);
		this.#resolver.reject(reason);
		if (!wasReady) {
			try {
				this.#initData?.sendMessage([this.#initData.channelId], REMOTE_ACTION.CLOSE, this.#closeReason);
			} catch {
				this.#initData?.sendMessage([this.#initData.channelId], REMOTE_ACTION.CLOSE, "parse error");
			}
			return;
		}
		if (!this.#initData) return;
		const subscribedChannelsList = this.#initData.subscribers.get(this.#source) ?? [];
		subscribedChannelsList.splice(subscribedChannelsList.indexOf(this.#initData.channelId), 1);
		if (subscribedChannelsList.length === 0) this.#cleanup()
		const deleted = this.#initData.channels.delete(this.#initData.channelId);
		if (deleted) this.#initData.sendMessage([this.#initData.channelId], REMOTE_ACTION.CLOSE, reason);
		if (this.#initData.getAutoDispose()) this.#source.dispose(reason);
	}
	
	on<E extends keyof RPCSourceChannelEvents>(eventName: E, listener: (...args: RPCSourceChannelEvents[E]) => void): any{
		this.#events.on(eventName, listener);
		return this;
	};
	
	once<E extends keyof RPCSourceChannelEvents>(eventName: E, listener: (...args: RPCSourceChannelEvents[E]) => void): any{
		this.#events.once(eventName, listener);
		return this;
	};
	
	off<E extends keyof RPCSourceChannelEvents>(eventName: E, listener: (...args: RPCSourceChannelEvents[E]) => void): any{
		this.#events.off(eventName, listener);
		return this;
	}
}