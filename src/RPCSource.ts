import EventEmitter from "./EventEmitter.js";
import {CLIENT_ACTION, REMOTE_ACTION, ClientMessage, RemoteMessage} from "./contract.js";

export type RPCSourceConnection = (send: (...messages: ClientMessage) => void, close: (reason?: any) => void) => (...messages: RemoteMessage) => void;


/**
 * remote call handler for {@link RPCSource}
 * @param caller - caller from `RPCSource.start`
 * @param path - path of remote function.
 * For example, when a client calls `rpc.math.sum(1, 2)` path will be `["math", "summ"]`.
 * @param args - arguments with which the remote function was called
 * For example, when a client calls `rpc.math.sum(1, 2)` args will be `[1, 2]`.
 * @param openChannel - true if the client called rpc as constructor (with `new`).
 * In this case the handler must return a {@link RPCSource} or {@link Promise}<{@link RPCSource}>.
 */
export type RPCHandler<T = any> = (
	channel: RPCSourceChannel<T>,
	path: string[],
	args: any[],
	newChannel: boolean,
) => any | Promise<any> | RPCSource;

/** @hidden */
type EventPath<T, K extends keyof T = keyof T> = (
	K extends (string|number) ? (
		T[K] extends infer P ? (
			0 extends (1 & P) ? (K | [K, ...(number|string)[]]) :
			P extends unknown[] ? (K | [K]) : [K, ...(
				EventPath<T[K]> extends infer NEXT extends ((string|number)|(string|number)[]) ? (
					NEXT extends any[] ? NEXT : [NEXT]
				) : never
			)]
		): never
	) : never
);

type EventPathArgs<PATH extends number|string|(number|string)[], FORM> = (
	0 extends (1 & FORM) ? any[] :
	PATH extends (number|string) ? EventPathArgs<[PATH], FORM> :
	PATH extends [] ? FORM extends any[] ? 0 extends (1 & FORM) ? any[] : FORM : never :
	PATH extends [infer PROP, ...infer TAIL extends (number|string)[]] ? (
		PROP extends keyof FORM ? EventPathArgs<TAIL, FORM[PROP]> : never
	) : never
);

const isConstructable = (fn: any) => {
	try {
		return Boolean(class extends fn {})
	} catch {
		return false
	}
};

const isESClass = (fn: any) => (
	typeof fn === 'function' && isConstructable(fn) &&
	Function.prototype.toString.call(fn).startsWith("class")
);


class RPCSourceChannel<S = RPCSource> {
	readonly #source;
	readonly #closeHook;
	#closed: boolean = false;
	#context: any;
	/** @hidden */
	constructor(
		source: RPCSource,
		closeHook: (reason: any) => void,
		context: any,
	) {
		this.#source = source;
		this.#closeHook = closeHook;
		this.#context = context;
	}
	
	get context() {return this.#context}
	
	/**
	 * channel is closed
	 */
	get closed() {return this.#closed}
	/**
	 * get rpc source
	 */
	get source(): S {return this.#source as any;}
	/**
	 * close this communication channel
	 * @param reason
	 */
	close(reason?: any){
		if (this.#closed) return;
		this.#closed = true;
		this.#closeHook(reason);
	}
}

/** @hidden */
export type { RPCSourceChannel };

type BoxMethods<T, PREFIX extends string> = {
	[KEY in keyof T as KEY extends `${PREFIX}${infer NAME}` ? NAME : never]: T[KEY]
}

type MetaScopeValue<METHODS, EVENTS, STATE> = {
	[Symbol.unscopables]: {
		__rpc_methods: METHODS,
		__rpc_events: EVENTS,
		__rpc_state: STATE,
	}
}

const dangerPropNames = [
	"__proto__",
	"__defineGetter__",
	"__defineSetter__",
	"__lookupGetter__",
	"__lookupSetter__",
]

/**
 * Remote procedure call handler
 */
export default class RPCSource<METHODS extends (Record<string, any> | string) = {}, STATE = undefined, EVENTS = any> implements Disposable {
	
	static with <
		const BIND_METHODS extends string | Record<string, any> = {},
		BIND_STATE = undefined,
		const BIND_EVENTS = {}
	>(): {[K in keyof typeof RPCSource]: (typeof RPCSource)[K]} & {
		new<METHODS extends Record<string, any> | string = BIND_METHODS, STATE = BIND_STATE, EVENTS = BIND_EVENTS>(methods: METHODS, state?: STATE): RPCSource<METHODS, STATE, EVENTS>,
	};
	/**
	 * Create a new constructor of {@link RPCSource} with bound methods.
	 * @example
	 * ```typescript
	 * export class Counter extends RPCSource.with("$_")<number> {
	 *   $_increment(){
	 *     this.setState(this.state + 1);
	 *   }
	 * }
	 * // client code
	 * const rpc = new RPCChannel(client);
	 * const rpcCounter = new rpc.Counter(100);
	 * await rpcCounter.increment();
	 * console.log(rpcCounter.state) // 101
	 * ```
	 * @param methods bound methods for remote call
	 */
	static with<
		const BIND_METHODS extends Record<string, any> | string = {},
		BIND_STATE = undefined,
		const BIND_EVENTS = {}
	>(methods: BIND_METHODS | RPCHandler): {[K in keyof typeof RPCSource]: (typeof RPCSource)[K]} & {
		new<STATE = BIND_STATE, EVENTS = BIND_EVENTS>(state?: STATE): RPCSource<BIND_METHODS, STATE, EVENTS>
	};
	/**
	 * Create a new constructor of {@link RPCSource} with bound methods and initial state.
	 * @example
	 * ```typescript
	 * const Counter = RPCSource.with({}, 0);
	 * export const counter = new Counter();
	 * setInterval(() => {
	 *   counter.setState(state => state+1)
	 * }, 1000);
	 * ```
	 * @param methods bound methods for remote call
	 * @param state initial state
	 */
	static with<
		const BIND_METHODS extends Record<string, any> | string = {},
		BIND_STATE = undefined,
		const BIND_EVENTS = {}
	>(methods: BIND_METHODS | RPCHandler, state: BIND_STATE): {[K in keyof typeof RPCSource]: (typeof RPCSource)[K]} & {
		new<EVENTS = BIND_EVENTS>(): RPCSource<BIND_METHODS, BIND_STATE, EVENTS>,
	};
	static with (this: FunctionConstructor, ...prependArgs: any): any {
		return class extends this {
			constructor(...args: any) {
				super(...prependArgs, ...args);
			}
		};
	}
	
	#handler: RPCHandler
	#autoDispose = false
	#disposeReason: any
	#innerEvents = new EventEmitter<{
		message: [eventPath: (string|number)[], eventData: any[]],
		state: [STATE],
		dispose: [any],
		channel: [RPCSourceChannel],
	}>();
	#state?: STATE;
	/** @hidden */
	declare public [Symbol.unscopables]: MetaScopeValue<METHODS extends string ? BoxMethods<this, METHODS> : METHODS, EVENTS, STATE>
	
	/**
	 * Proxy-based getter for client's channel
	 */
	get channel(): RPCSourceChannel<this> {
		throw new Error("RPCSource#channel is not available in this context");
	};
	/**
	 * Proxy-based getter for client's channel
	 */
	static get channel(): RPCSourceChannel<RPCSource<any, any>> {
		throw new Error("RPCSource.channel is not available in this context");
	};
	
	/**
	 * get current state
	 */
	get state(): STATE {return this.#state as any}
	
	/**
	 * Create new instance of RPC
	 * @example
	 * ```typescript
	 * // remote code
	 * const rpcSource = new RPCSource((connection: Connection, path: string[], args: any[], openChannel: boolean) => {
	 *   if (path.length === 0 && path[0] === "sum") return args[0] + args[1];
	 *   throw new Error("method not found");
	 * });
	 * RPCSource.start(rpcSource, room);
	 * ```
	 * ```typescript
	 * // client code
	 * const rpc = new RPCChannel(client);
	 * const result = await rpc.test(5, 3);
	 * console.assert(result === 8);
	 * ```
	 * @example
	 * ```typescript
	 * // remote code
	 * const rpcSource = new RPCSource({
	 *   sum(x, y){
	 *     console.log("connection:", room.useConnection());
	 *     return x + y;
	 *   }
	 * });
	 * RPCSource.start(rpcSource, room);
	 * ```
	 * ```typescript
	 * // client code
	 * const rpc = new RPCChannel(client);
	 * const result = await rpc.test(5, 3);
	 * console.assert(result === 8);
	 * ```
	 * @param {RPCHandler|METHODS} handler
	 * handler can be:
	 * - `function` of type {@link RPCHandler};
	 * - `object` with methods for remote call.
	 * - `string` prefix: use self methods starting with prefix for remote call.
	 * @param initialState
	 */
	constructor(handler?: RPCHandler|METHODS, initialState?: STATE) {
		this.#state = initialState;
		if (typeof handler === "object") handler = RPCSource.createDefaultHandler({methods: handler, thisValue: this});
		else if (typeof handler === "string") handler = RPCSource.createDefaultHandler({methods: this, thisValue: this}, handler);
		this.#handler = handler as any;
	}
	
	/**
	 * create {@link RPCHandler} based on object with methods
	 * @param parameters
	 * @param parameters.methods object with methods.
	 * @param parameters.getThis should return the "this" value for method call.
	 * @param prefix prefix of used methods, empty by default
	 * @returns - {@link RPCHandler}
	 */
	static createDefaultHandler(
		parameters: { methods: any, thisValue?: any },
		prefix: string = ""
	): RPCHandler {
		if (prefix) {
			for (let prop of dangerPropNames) {
				if (prop.startsWith(prefix)) {
					throw new Error("prefix "+prefix+" is danger");
				}
			}
		}
		return function(channel: RPCSourceChannel, path: string[], args: any[], newChannel: boolean) {
			let target: any = parameters?.methods;
			for (let i=0; i<path.length; i++) {
				const step = i === 0 ? prefix + path[i] : path[i];
				if (dangerPropNames.includes(step)) throw new Error("wrong path: "+step+" in ("+prefix+")"+path.join(".")+": forbidden step");
				if (typeof target !== "object") throw new Error("wrong path: "+step+" in ("+prefix+")"+path.join(".")+": not object");
				if (i > 0 || !prefix){
					if (!Object.keys(target).includes(step)) {
						throw new Error("wrong path: "+step+" in ("+prefix+")"+path.join(".")+": forbidden prop");
					}
				}
				target = target[step];
			}
			if (newChannel && args.length === 0) {
				if (target instanceof RPCSource) return target;
				if (typeof target?.then === "function") return target;
			}
			if (newChannel && (target?.prototype instanceof RPCSource) && isESClass(target)) {
				const MetaConstructor = function (...args: any){
					return Reflect.construct(target, args, MetaConstructor);
				}
				MetaConstructor.prototype = target.prototype;
				MetaConstructor.channel = channel;
				MetaConstructor.autoClose = true;
				const result: RPCSource = MetaConstructor(...args);
				result.#autoDispose = MetaConstructor.autoClose
				return result;
			}
			let thisArg = parameters.thisValue;
			if (thisArg && (typeof thisArg === "object" || typeof thisArg === "function")) {
				thisArg = new Proxy(thisArg, {
					get(target: any, p: string | symbol, receiver: any): any {
						if (p === "channel") return channel;
						return Reflect.get(target, p, receiver);
					}
				});
			}
			return target.apply(thisArg, args);
		}
	}
	
	/**
	 * Create function with validation of arguments
	 * @param validator function to validate arguments. `(args) => boolean | any[]`
	 * - args - array of validating values
	 * - returns:
	 *   - `true` - pass args to the target function
	 *   - `false` - validation error will be thrown
	 *   - `any[]` - replace args and pass to the target function
	 * - throws: error will be thrown
	 * @param handler - target function
	 * @returns a new function with validation of arguments
	 * @example
	 * ```typescript
	 * const validateString = (args: any[]) => args.length === 1 && [String(args[0])] as const;
	 *
	 * const fn = RPCSource.validate(validateString, (arg) => {
	 *   return arg.toUpperCase() // <-- string
	 * });
	 *
	 * fn("foo") // "FOO"
	 * fn(10) // "10"
	 * fn(); // throws error
	 * fn("foo", "bar"); // throws error
	 * ```
	 */
	static validate<
		V extends ((args: any[]) => false | readonly any[]) | ((args: any[]) => args is any[]),
		A extends (
			...args: V extends ((args: any[]) => args is infer R extends any[]) ? R : V extends ((args: any[]) => false | infer R extends readonly any[]) ? R : never
		) => any
	>(
		validator: V,
		handler: A
	): NoInfer<A> {
		return function (...args: any){
			const validateResult = validator(args);
			if (Array.isArray(validateResult)) {
				return handler(...validateResult as any);
			}
			if (!validateResult) throw new Error("invalid parameters");
			return handler(...args);
		} as any;
	}
	
	/** apply generic types for events */
	withEventTypes<E = EVENTS>(): RPCSource<METHODS, STATE, E>{
		return this as any;
	}
	
	/** @hidden */
	setState(state: (oldState: STATE) => STATE): this
	/**
	 * set new state
	 * @param state
	 * - new state value, if state is not a function.
	 * - function takes the current state and returns a new one
	 */
	setState(state: STATE extends (...args: any) => any ? never : STATE): this
	setState(state: any): this{
		if (this.disposed) throw new Error("disposed");
		const newState = typeof state === "function" ? state(this.#state) : state;
		if (this.#state === newState) return this;
		this.#state = newState;
		this.#innerEvents.emitWithTry("state", newState);
		return this;
	}
	
	/** apply generic types for state. */
	withState<S>(): RPCSource<METHODS, S, EVENTS>
	/** apply generic types for state and set new state. */
	withState<S>(state: S): RPCSource<METHODS, S, EVENTS>
	withState(...stateArgs: any[]) {
		if (stateArgs.length > 0) this.#state = stateArgs[0];
		return this;
	}
	
	#disposed = false;
	get disposed(){
		return this.#disposed;
	}
	
	/**
	 * Emit event for all connected clients.
	 * Reserved event names: `close`, `init`, `error`, `state`
	 * @param event path for event. String or array of strings.
	 * @param args event values
	 */
	emit<P extends 0 extends (1&EVENTS) ? (string|number|(string|number)[]) : EventPath<EVENTS>>(
		event: P,
		...args: 0 extends (1&EVENTS) ? any[] : EventPathArgs<P, EVENTS>
	): this{
		if (this.#disposed) throw new Error("disposed");
		const path: (string|number)[] = (typeof event === "string" || typeof event === "number") ? [event] : event;
		this.#innerEvents.emitWithTry("message", path, args);
		return this;
	}
	
	/**
	 * dispose this source and disconnect all channels
	 * @param reason
	 */
	dispose(reason?: any){
		if (this.#disposed) return;
		this.#disposed = true;
		this.#disposeReason = reason;
		this.#innerEvents.emitWithTry("dispose", reason);
	}
	
	/**
	 * dispose this source and disconnect all channels
	 */
	[Symbol.dispose](){
		this.dispose("disposed");
	}
	
	/**
	 * start listening for messages and processing procedure calls
	 * @param rpcSource message handler
	 * @param connection client's connection
	 * @param maxChannelsPerClient set a limit on the number of opened channels
	 * @param caller caller
	 */
	static start(
		rpcSource: RPCSource<any, any, any>,
		connection: RPCSourceConnection,
		{maxChannelsPerClient = Infinity, context}: {maxChannelsPerClient?: number, context?: any} = {}
	){
		const channels = new Map<string|number, RPCSourceChannel>
		const subscribers = new Map<RPCSource<any, any, any>, (string|number)[]>
		let sendMessage = connection(
			(...args) => onMessage(...args),
			(reason) => onClose(reason)
		);
		let onClose = (reason?: any) =>{
			sendMessage = onMessage = onClose = () => {};
			closeAll(reason);
		}
		let onMessage = (...args: any[]) => {
			if (args.length === 1) return onMessageInitialize(args[0]);
			if (args.length < 3) return;
			const [channelId, operationId, ...msgArgs] = args;
			const channel = channels.get(channelId as any);
			if (!channel) {
				sendMessage([channelId], REMOTE_ACTION.CLOSE, new Error("wrong channel"));
				if (operationId === CLIENT_ACTION.CREATE) {
					sendMessage(msgArgs[0], REMOTE_ACTION.CLOSE, new Error("wrong channel"));
				}
				return;
			}
			
			if (operationId === CLIENT_ACTION.NOTIFY) return onMessageNotify(channel, msgArgs[0], msgArgs[1])
			if (operationId === CLIENT_ACTION.CALL) return void onMessageCallMethod(channel, channelId, msgArgs[0], msgArgs[1], msgArgs[2]);
			if (operationId === CLIENT_ACTION.CLOSE) return onMessageClose(channel, channelId, msgArgs[0]);
			
			if (operationId === CLIENT_ACTION.CREATE) return onMessageCreateChannel(channel, msgArgs[0], msgArgs[1], msgArgs[2]);
		}
		
		function onMessageInitialize(channelId: string) {
			RPCSource.#createChannel(rpcSource, channelId, sendMessage, channels, subscribers, context)
		}
		
		function onMessageNotify(channel: RPCSourceChannel, path: (string|number)[], args: any[]) {
			try {
				channel.source.#handler(channel, path as any[], args as any[], false);
			} catch {}
		}
		
		function onMessageRequestState(channel: RPCSourceChannel, channelId: string) {
			try {
				sendMessage([channelId], REMOTE_ACTION.STATE, channel.source.state);
			} catch {
				sendMessage([channelId], REMOTE_ACTION.STATE, new Error("state parse error"));
			}
		}
		
		async function onMessageCallMethod(channel: RPCSourceChannel, channelId: string, callId: any, path: string[], callArgs: any[]) {
			try {
				try {
					const result = await channel.source.#handler(channel, path, callArgs, false);
					if (channel.closed) return;
					if (result instanceof RPCSource) throw new Error("wrong data type");
					sendMessage([channelId], REMOTE_ACTION.RESPONSE_OK, callId, result);
				} catch (error) {
					sendMessage([channelId], REMOTE_ACTION.RESPONSE_ERROR, callId, error as any);
				}
			} catch {
				sendMessage([channelId], REMOTE_ACTION.RESPONSE_ERROR, callId, "parse error");
			}
		}
		
		function onMessageClose(channel: RPCSourceChannel, channelId: string, reason: any) {
			channels.delete(channelId);
			channel?.close(reason);
		}
		
		async function onMessageCreateChannel(channel: RPCSourceChannel, newChannelId: string, path: string[], callArgs: any[]) {
			try {
				try {
					if (channels.size >= maxChannelsPerClient) throw new Error("channels limit");
					// todo: send current channel to #handler
					const result = await channel.source.#handler(channel, path, callArgs, true);
					if (!(result instanceof RPCSource)) throw new Error("wrong data type");
					RPCSource.#createChannel(result, newChannelId, sendMessage, channels, subscribers, context);
				} catch (error) {
					sendMessage([newChannelId], REMOTE_ACTION.CLOSE, error as any);
				}
			} catch {
				sendMessage([newChannelId], REMOTE_ACTION.CLOSE, "parse error");
			}
		}
		
		function closeAll(reason?: any){
			for (const channel of channels.values()) channel.close(reason);
		}
		return closeAll;
	}
	
	static #createChannel(
		rpcSource: RPCSource<any, any, any>,
		channelId: string|number,
		sendMessage: (...args: any[]) => void,
		channels: Map<string|number, RPCSourceChannel>,
		subscribers: Map<RPCSource<any, any, any>, (string|number)[]>,
		context: any
	): boolean {
		if (rpcSource.disposed) {
			try {
				sendMessage([channelId], REMOTE_ACTION.CLOSE, rpcSource.#disposeReason);
			} catch {
				sendMessage([channelId], REMOTE_ACTION.CLOSE, "parse error");
			}
			return false;
		}
		function onRpcSourceMessage(path: (string|number)[], args: any[]){
			sendMessage(subscribers.get(rpcSource), REMOTE_ACTION.EVENT, path, args);
		}
		function onRpcSourceState(state: any){
			try {
				sendMessage(subscribers.get(rpcSource), REMOTE_ACTION.STATE, state);
			} catch {
				sendMessage(subscribers.get(rpcSource), REMOTE_ACTION.STATE, new Error("state parse error"));
			}
		}
		function onRpcSourceDispose(disposeReason: any){
			sendMessage(subscribers.get(rpcSource), REMOTE_ACTION.CLOSE, disposeReason);
			channels.delete(channelId as any);
			subscribers.delete(rpcSource);
			cleanup();
		}
		function cleanup(){
			rpcSource.#innerEvents.off("message", onRpcSourceMessage);
			rpcSource.#innerEvents.off("state", onRpcSourceState);
			rpcSource.#innerEvents.off("dispose", onRpcSourceDispose);
		}
		function onChannelClose(reason?: any){
			const subscribedChannelsList = subscribers.get(rpcSource) ?? [];
			subscribedChannelsList.splice(subscribedChannelsList.indexOf(channelId), 1);
			if (subscribedChannelsList.length === 0) cleanup()
			const deleted = channels.delete(channelId);
			if (deleted) sendMessage([channelId], REMOTE_ACTION.CLOSE, reason);
			if (rpcSource.#autoDispose) rpcSource.dispose(reason);
		}
		
		if (subscribers.has(rpcSource)) {
			subscribers.get(rpcSource)?.push(channelId);
		} else {
			const subscribedChannelsList = [channelId];
			subscribers.set(rpcSource, subscribedChannelsList);
			rpcSource.#innerEvents.on("message", onRpcSourceMessage);
			rpcSource.#innerEvents.on("state", onRpcSourceState);
			rpcSource.#innerEvents.on("dispose", onRpcSourceDispose);
		}
		const channel = new RPCSourceChannel(rpcSource, onChannelClose, context);
		channels.set(channelId, channel);
		try {
			sendMessage([channelId], REMOTE_ACTION.STATE, rpcSource.#state);
		} catch {
			sendMessage([channelId], REMOTE_ACTION.STATE, new Error("state parse error"));
		}
		return true;
	}
}