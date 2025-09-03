import EventEmitter from "./EventEmitter.js";
import {CLIENT_ACTION, REMOTE_ACTION, ClientMessage, RemoteMessage} from "./contract.js";
import type { MetaScope, EventPathArgs, EventPath } from "./type-utils.js";
import type RPCSource from "./RPCSource.js";

export type RPCChannelConnection = (onMessage: (...messages: RemoteMessage) => void, onClose: (reason?: any) => void) => (...messages: ClientMessage) => void;

interface MetaDesc<M = any, E = any, S = any> {
	methods?: M;
	events?: E;
	state?: S;
}

interface MetaType<M = any, E = any, S = any> {
	methods: M;
	events: E;
	state: S;
}

type MetaScopeToDesc<T extends MetaScope> = T extends MetaScope<infer M , infer E, infer S> ? MetaType<M, E, S> : never;

type ExtraKeys = "on" | "once" | "off" | "notify" | "then";

type ExtractMetaType<T extends MetaDesc | MetaScope> = (
	(T extends MetaScope ? MetaScopeToDesc<T> : T) extends infer D ? {
		methods: D extends {methods: infer M} ? M : any,
		events: D extends {events: infer E} ? E : any,
		state: D extends {state: infer S} ? S : any,
	} : never
	)

type RPCMethodsAny = {
	[key: string] : RPCMethodsAny & RPCMethod<any, any> & RPCConstructor<any, any>
}

type RPCMethodsPart<T, EXCLUDE = ExtraKeys> = 0 extends (1 & T) ? RPCMethodsAny : (
	// if T is an object with properties, map them
	T extends ((...args: any) => any) | {new (...args: any): any} | MetaScope ? unknown : {
		[K in Exclude<keyof T & string, EXCLUDE>]: RPCMethodsPart<T[K]>
	}
) & (
	// if T is a function, extract method and constructor
	T extends (...args: infer A) => infer R ? (
		// extract as method
		[R] extends [never] ? RPCMethod<A, R> :
			Exclude<Awaited<R>, MetaScope> extends infer RC ? ([RC] extends [never] ? unknown : RPCMethod<A, RC>) : unknown
	) & (
		// extract as constructor
		[R] extends [never] ? unknown :
			Extract<Awaited<R>, MetaScope> extends infer RC extends MetaScope ? RPCConstructor<A, RC>: unknown
	) : unknown
) & (
	// if T is a constructor of RPCSource, extract constructor
	T extends (new (...args: infer A) => infer R extends MetaScope) ? RPCConstructor<A, R> : unknown
) & (
	// if T is a promise of RPCSource, extract as constructor with no arguments
	T extends PromiseLike<infer R extends MetaScope> ? RPCConstructor<[], R> : unknown
) & (
	// if T is RPCSource, extract as constructor with no arguments
	T extends MetaScope ? RPCConstructor<[], T> : unknown
);

type RPCMethod<A extends any[], R> = {
	(...args: A): Promise<Awaited<R>>
	notify(...args: A): void
	call: never,
	bind: never,
	apply: never,
	name: never,
	length: never
}

type RPCConstructor<A extends any[], R extends MetaScope> = {
	new (...args: A): RPCChannel<R>;
	call: never,
	bind: never,
	apply: never,
	name: never,
	length: never
}

interface EventHandler<F, SPECIAL_EVENTS extends string> {
	on<E extends Exclude<EventPath<F>, SPECIAL_EVENTS>>(this: this, eventName: E, handler: (...args: EventPathArgs<E, F>) => void): this,
	once<E extends Exclude<EventPath<F>, SPECIAL_EVENTS>>(this: this, eventName: E, handler: (...args: EventPathArgs<E, F>) => void): this,
	off<E extends Exclude<EventPath<F>, SPECIAL_EVENTS>>(this: this, eventName: E, handler: (...args: EventPathArgs<E, F>) => void): this,
}
interface BaseEventHandler<S> {
	on<E extends keyof RPCChannelEvents<S>>(this: this, eventName: E, handler: (...args: RPCChannelEvents<S>[E]) => void): this,
	once<E extends keyof RPCChannelEvents<S>>(this: this, eventName: E, handler: (...args: RPCChannelEvents<S>[E]) => void): this,
	off<E extends keyof RPCChannelEvents<S>>(this: this, eventName: E, handler: (...args: RPCChannelEvents<S>[E]) => void): this,
}
type EventsOfAny<SPECIAL_EVENTS extends string = never> = EventHandlerAny<SPECIAL_EVENTS> & {[key: string]: EventsOfAny}
interface EventHandlerAny<SPECIAL_EVENTS extends string = never> {
	on<T extends string | number | (string|number)[]>(this: this, eventName: T extends SPECIAL_EVENTS ? never : T, handler: (...args: any) => void): this,
	once<T extends string | number | (string|number)[]>(this: this, eventName: T extends SPECIAL_EVENTS ? never : T, handler: (...args: any) => void): this,
	off<T extends string | number | (string|number)[]>(this: this, eventName: T extends SPECIAL_EVENTS ? never : T, handler: (...args: any) => void): this,
}
interface EventHandlerEmptyArray<E extends any[]> {
	on(eventName: [], handler: (this: this, ...args: E) => void): this,
	once(eventName: [], handler: (this: this, ...args: E) => void): this,
	off(eventName: [], handler: (this: this, ...args: E) => void): this,
}

type HasAnyValue<T, Y, N> = T[keyof T] extends infer V ? ([V] extends [never] ? N : Y ) : N;

type RPCEventsPart<T, SPECIAL_EVENTS extends string = never> = [T] extends [never] ? unknown : (0 extends (1 & T) ? EventsOfAny<SPECIAL_EVENTS> : (
	Extract<T, any[]> extends infer F extends any[] ? [F] extends [never] ? unknown : & EventHandlerEmptyArray<F> : never
	) & (
	Exclude<T, any[]> extends infer F ? (
		HasAnyValue<F, {
			[K in Exclude<keyof F, ExtraKeys> as F[K] extends any[] ? never : K]: RPCEventsPart<F[K]>
		} & EventHandler<F, SPECIAL_EVENTS>, unknown >
		) : never
	));

interface RPCChannelInstance<S = unknown> extends BaseEventHandler<S> {
	get state(): S,
	close(reason?: any): void,
	get closed(): boolean
	get ready(): boolean
	then: void,
	promise: Promise<this>
}

type RPCChannel<T extends MetaScope | MetaDesc = {}> = ExtractMetaType<T> extends {methods: infer M, events: infer E, state: infer S} ? (
	& Disposable
	& MetaScope<M, E, S>
	& RPCChannelInstance<S>
	& RPCEventsPart<E, keyof RPCChannelEvents<any>>
	& RPCMethodsPart<M, Exclude<keyof RPCChannelInstance | ExtraKeys, "notify">>
	) : never

/**
 * Basic events of {@link RPCChannel}
 * @event
 */
export type RPCChannelEvents<S> = {
	/**
	 * state is changed
	 * @example
	 * ```typescript
	 * const rpc = new RPCChannel(client);
	 * rpc.on("state", (newState, oldState) => {
	 *   console.log("state changed", newState);
	 * });
	 * ```
	 */
	state: [newState: S, oldState?: S]
	/**
	 * channel is closed
	 * @example
	 * ```typescript
	 * const rpc = new RPCChannel(client);
	 * rpc.on("close", (reason) => {
	 *   console.log("channel closed with reason:", reason);
	 *    console.assert(rpc.closed);
	 * });
	 * ```
	 */
	close: [reason: any]
	/**
	 * channel is closed
	 * @example
	 * ```typescript
	 * const rpc = new RPCChannel(client);
	 * rpc.on("ready", () => {
	 *   console.log("channel ready");
	 *   console.assert(rpc.ready);
	 * });
	 * ```
	 */
	ready: []
	/**
	 * channel is closed before was open
	 * @example
	 * ```typescript
	 * const rpc = new RPCChannel(client);
	 * rpc.on("error", (reason) => {
	 *   console.log("can not open channel", reason);
	 *   console.assert(rpc.closed);
	 * });
	 * ```
	 */
	error: [error: any]
}

/**
 * Constructor for new RPC channel based on {@link RPCSource}
 * @group Classes
 */
const RPCChannel = (function(connection: RPCChannelConnection | RPCSource, options?: {
	getNextChannelId?: () => string|number,
	connectionTimeout?: number | AbortSignal
}) {
	let connectionFn: RPCChannelConnection;
	if (typeof connection === "function") {
		connectionFn = connection;
	} else {
		connectionFn = (onChannelMessage) => {
			let onSourceMessage: any;
			(connection.constructor as typeof RPCSource).start(connection, (onMessage: any) => {
				onSourceMessage = onMessage;
				return (...args) => onChannelMessage(...args);
			});
			return onSourceMessage;
		}
	}
	const manager = new ChannelManager(connectionFn, options?.getNextChannelId, options?.connectionTimeout);
	return manager.defaultChannel.proxy;
	
} as any as (
	{
		/**
		 * Create a new channel for RPC
		 * @typeParam M - typeof current {@link RPCSource} from server
		 * @param {RPCChannelConnection} connection - message handler
		 * @param [options]
		 * @param options.getNextChannelId generator for next channel id, default is random string of 16 characters.
		 * @param options.connectionTimeout - timeout in milliseconds or {@link AbortSignal} to wait for channel ready state. Default is no timeout.
		 * @returns {RPCChannelInstance<undefined>} - stateless channel.
		 * - result extends {@link RPCChannelInstance}.
		 * - result has all methods of current {@link RPCSource}
		 * - all methods are asynchronous and return a {@link Promise}<{@link any}>
		 * - result has constructors for all constructable methods of {@link RPCSource}.
		 * - all constructors are synchronous and return a new {@link RPCChannel}
		 */
		new<M extends MetaScope | MetaDesc = {}>(
			connection: RPCChannelConnection,
			options?: {
				getNextChannelId?: () => string|number,
				connectionTimeout?: number | AbortSignal
			}
		): RPCChannel<M>,
		
		/**
		 * Create a new channel for RPC
		 * @typeParam M - typeof current {@link RPCSource}
		 * @param {RPCSource<any, any>} source
		 * @param [options]
		 * @param options.getNextChannelId generator for next channel id, default is random string of 16 characters.
		 * @param options.connectionTimeout - timeout in milliseconds or {@link AbortSignal} to wait for channel ready state. Default is no timeout.
		 * @returns {RPCChannelInstance<undefined>} - stateless channel.
		 * - result extends {@link RPCChannelInstance}.
		 * - result has all methods of current {@link RPCSource}.
		 * - all methods are asynchronous and return a {@link Promise}<{@link any}>
		 * - result has constructors for all constructable methods of {@link RPCSource}.
		 * - all constructors are synchronous and return a new {@link RPCChannel}
		 */
		new<R extends RPCSource<any, any, any>>(
			source: R,
			options?: {
				getNextChannelId?: () => string|number,
				connectionTimeout?: number | AbortSignal
			}
		): RPCChannel<R>,
	}
	));

/** @hidden */
class ChannelManager {
	defaultChannel: Channel;
	sendMessage: (...args: any[]) => void = () => {};
	channels = new Map<string|number, Channel>();
	
	constructor(
		connection: RPCChannelConnection,
		private getNextChannelId: () => string|number = generateChannelId,
		connectionTimeout?: number | AbortSignal
	) {
		const defaultChannel = this.defaultChannel = new Channel(this, getNextChannelId());
		if (connectionTimeout instanceof AbortSignal && connectionTimeout.aborted) {
			defaultChannel.close(connectionTimeout.reason);
			return;
		}
		this.channels.set(defaultChannel.channelId, defaultChannel);
		this.sendMessage = connection(
			(...args) => this.onMessage(...args),
			(reason) => this.onClose(reason)
		);
		if (!defaultChannel.closed) this.sendMessage(defaultChannel.channelId);
		if (connectionTimeout != undefined && !defaultChannel.closed && !defaultChannel.ready) {
			if (typeof connectionTimeout === "number") {
				const cleanup = () => {
					clearTimeout(timer);
					defaultChannel.events.off("ready", cleanup);
				}
				defaultChannel.events.once("ready", cleanup);
				const timer = setTimeout(() => {
					defaultChannel.close("timeout");
					cleanup();
				}, connectionTimeout);
			} else {
				const cleanup = () => {
					(connectionTimeout as AbortSignal).removeEventListener("abort", onAbort);
					defaultChannel.events.off("ready", cleanup);
				}
				function onAbort(){
					defaultChannel.close((connectionTimeout as AbortSignal).reason);
					cleanup();
				}
				connectionTimeout.addEventListener("abort", onAbort);
				defaultChannel.events.once("ready", cleanup);
			}
		}
	}
	
	createNextChannel(){
		const channelId = this.getNextChannelId();
		if (this.channels.has(channelId)) throw new Error(`channel with id '${channelId}' already exists, channel id conflict`);
		const channel = new Channel(this, channelId);
		this.channels.set(channelId, channel);
		return channel;
	}
	
	onMessage = (...args: any[]) => {
		if (args.length < 3) return;
		const [channels, operationCode, ...messageArgs] = args;
		for (const channelId of channels) {
			const channel = this.channels.get(channelId as any);
			if (!channel) continue;
			if (operationCode === REMOTE_ACTION.RESPONSE_ERROR || operationCode === REMOTE_ACTION.RESPONSE_OK) {
				channel.onResponse(operationCode, messageArgs[0], messageArgs[1]);
			} else if (operationCode === REMOTE_ACTION.STATE) {
				channel.onState(messageArgs[0]);
			} else if (operationCode === REMOTE_ACTION.CLOSE) {
				channel.onClose(messageArgs[0]);
			} else if (operationCode === REMOTE_ACTION.EVENT) {
				channel.onEvent(messageArgs[0] as any, messageArgs[1] as any);
			}
		}
	}
	
	onClose = (reason: any): void => {
		this.sendMessage = this.onMessage = this.onClose = () => {};
		for (let channel of this.channels.values()) {
			channel.onClose(reason);
		}
	}
}

/** @hidden */
const proxyTarget = function(){};

/** @hidden */
class Channel {
	proxy: any;
	state: any = undefined;
	events = new EventEmitter();
	resolver = Promise.withResolvers<RPCChannel>();
	ready = false;
	closed = false;
	currentCallId = 0;
	readonly responseEventTarget = new EventTarget();
	
	constructor(public manager: ChannelManager, public channelId: any) {
		this.proxy = this.createProxy();
		this.resolver.promise.catch(() => {});
	}
	
	onState(state?: any){
		if (this.closed) return;
		const oldState = this.state;
		const wasReady = this.ready;
		this.state = state;
		this.ready = true;
		if (!wasReady) {
			this.events.emitWithTry("ready");
			this.events.emitWithTry("state", state);
			this.resolver.resolve(this.proxy);
		} else {
			this.events.emitWithTry("state", state, oldState);
		}
	}
	
	onClose(reason: any){
		if (this.closed) return;
		const wasReady = this.ready;
		this.ready = false;
		this.closed = true;
		if (!wasReady) this.events.emitWithTry("error", reason);
		this.events.emitWithTry("close", reason);
		this.resolver.reject(reason);
		this.manager.channels.delete(this.channelId);
	}
	
	onEvent(path: string[], args: any[]){
		const eventName = JSON.stringify(path);
		this.events.emitWithTry(eventName, ...args);
	}
	
	onResponse(operationCode: any, callId: any, data: any){
		this.responseEventTarget.dispatchEvent(new CustomEvent(callId, {detail: [operationCode, data]}));
	}
	
	proxyApply = (path: string[], ...args: any[]) => {
		return new Promise<any>((resolve, reject) => {
			if (this.closed) throw new Error("channel is closed");
			const callId = this.currentCallId++;
			const onResponse = (event: Event) => {
				if (!(event instanceof CustomEvent)) return;
				const [type, response] = event.detail;
				clear(type ? reject: resolve, response);
			}
			const onClose = (reason: any) => {
				clear(reject, reason);
			}
			const clear = <T extends (...args: any[]) => any>(fn: T, ...args: Parameters<T>) => {
				this.responseEventTarget.removeEventListener(callId as any, onResponse);
				this.events.off("close", onClose);
				fn(...args);
			}
			this.responseEventTarget.addEventListener(callId as any, onResponse, {once: true});
			this.events.once("close", onClose);
			void this.sendToChannel(CLIENT_ACTION.CALL, callId, path, args);
		});
	}
	
	proxyConstruct = (path: string[], ...args: any[]) => {
		if (this.closed) throw new Error("channel is closed");
		const channel = this.manager.createNextChannel();
		void this.sendToChannel(CLIENT_ACTION.CREATE, channel.channelId, path, args);
		return channel.proxy;
	}
	
	async sendToChannel(callCode: CLIENT_ACTION, ...args: any[]) {
		this.manager.sendMessage(this.channelId, callCode, ...args);
	}
	
	close = (reason: any) => {
		if (this.closed) return;
		this.ready = false;
		this.closed = true;
		void this.sendToChannel(CLIENT_ACTION.CLOSE, reason)
		this.events.emitWithTry("close", reason);
		this.resolver.reject(reason);
		this.manager.channels.delete(this.channelId);
	}
	
	[Symbol.dispose] = () => {
		this.close("disposed");
	}
	
	createProxy(path: string[] = []){
		const children = new Map<string|number, any>();
		const events = this.events;
		const subscribers = new Map<string|symbol, (eventName: string|number|(string|number)[], handler: (...args: any) => void) => void>([
			["on", function(this: any, eventName: string|number|(string|number)[], handler: (...args: any) => void) {
				return events.on.call(this, getEventCode(path, eventName), handler);
			}],
			["once", function(this: any,eventName: string|number|(string|number)[], handler: (...args: any) => void) {
				return events.once.call(this, getEventCode(path, eventName), handler);
			}],
			["off", function(this: any, eventName: string|number|(string|number)[], handler: (...args: any) => void) {
				return events.off.call(this, getEventCode(path, eventName), handler);
			}]
		])
		const notify = (...args: any) => {
			void this.sendToChannel(CLIENT_ACTION.NOTIFY, path, args);
		}
		
		const proxyHandler = {
			get: (_target: any, prop: string|symbol) => {
				if (prop === "then") return undefined;
				if (path.length === 0) {
					if (prop === Symbol.dispose) return this[Symbol.dispose];
					if (prop === "ready") return this.ready;
					if (prop === "closed") return this.closed;
					if (prop === "state") return this.state;
					if (prop === "promise") return this.resolver.promise;
					if (prop === "close") return this.close;
				} else {
					if (prop === "notify") return notify;
				}
				if (subscribers.has(prop)) return subscribers.get(prop);
				if (typeof prop !== "string") return undefined;
				if (children.has(prop)) return children.get(prop);
				if (prop === "constructor") return RPCChannel;
				const handler = this.createProxy([...path, prop]);
				children.set(prop, handler);
				return handler;
			},
			apply: (target: any, thisArg: any, args: any[]) => {
				return this.proxyApply(path, ...args);
			},
			construct: (target: any, args: any[]) => {
				return this.proxyConstruct(path, ...args);
			},
			isExtensible(){return false},
			getPrototypeOf(){return null},
			setPrototypeOf(){return false},
			defineProperty(){throw new Error(`can not define property of channel`)},
			set(){throw new Error(`can not set property of channel`)},
			delete(){throw new Error(`can not delete property of channel`)},
			has(){return false},
			ownKeys(){return ["prototype"]}
		}
		return new Proxy(proxyTarget, proxyHandler);
	}
}

/** @hidden */
function getEventCode(path: string[], e: string|number|(string|number)[]){
	if (path.length > 0) return JSON.stringify([...path, ...(Array.isArray(e) ? e : [e])]);
	if (e === "close" || e === "ready" || e === "error" || e === "state") return e;
	return JSON.stringify(Array.isArray(e) ? e : [e]);
}

function generateChannelId() {
	return String.fromCharCode(...Array.from({length: 16}).map(() => Math.floor(Math.random() * 65535)))
}
export default RPCChannel;