import EventEmitter from "./EventEmitter.js";
import {CLIENT_ACTION, REMOTE_ACTION, ClientMessage, RemoteMessage} from "./contract.js";
import RPCSourceChannel from "./RPCSourceChannel.js"
import {getAccessor} from "./RPCSourceChannelAccessor.js"
import type {MetaScopeValue} from "./type-utils.js";

export type RPCSourceConnection = (onMessage: (...messages: ClientMessage) => void, onClose: (reason?: any) => void) => (...messages: RemoteMessage) => void;

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
export type RPCHandler<T extends RPCSource<any, any> = any> = (
	channel: RPCSource.Channel<T>,
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

type BoxMethods<T, PREFIX extends string> = {
	[KEY in keyof T as KEY extends `${PREFIX}${infer NAME}` ? NAME : never]: T[KEY]
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
class RPCSource<METHODS extends (Record<string, any> | string) = {}, STATE = undefined, EVENTS = any> implements Disposable {
	
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
		channel: [RPCSource.Channel],
	}>();
	#state?: STATE;
	/** @hidden */
	declare public [Symbol.unscopables]: MetaScopeValue<METHODS extends string ? BoxMethods<this, METHODS> : METHODS, EVENTS, STATE>
	
	/**
	 * Proxy-based getter for client's channel
	 */
	get channel(): RPCSource.Channel<this> {
		throw new Error("RPCSource#channel is not available in this context");
	};
	/**
	 * Proxy-based getter for client's channel
	 */
	static get channel(): RPCSource.Channel<RPCSource<any, any>> {
		throw new Error("RPCSource.channel is not available in this context");
	};
	
	/**
	 * Proxy-based getter for client's context
	 */
	get context(): any {
		throw new Error("RPCSource#channel is not available in this context");
	};
	/**
	 * Proxy-based getter for client's context
	 */
	static get context(): any {
		throw new Error("RPCSource#context is not available in this context");
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
		Object.defineProperties(this, { // bind methods that have access to private fields
			emit: {enumerable: false, value: this.emit.bind(this)},
			setState: {enumerable: false, value: this.setState.bind(this)},
			dispose: {enumerable: false, value: this.dispose.bind(this)},
		});
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
					throw new Error("prefix "+prefix+" is forbidden for security reasons");
				}
			}
		}
		return function(channel: RPCSource.Channel, path: string[], args: any[], newChannel: boolean) {
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
				MetaConstructor.context = channel.context;
				MetaConstructor.autoClose = true;
				const result: RPCSource = MetaConstructor(...args);
				result.#autoDispose = MetaConstructor.autoClose
				return result;
			}
			if (typeof target !== "function") {
				throw new Error("wrong path: ("+prefix+")"+path.join(".")+": is not a function");
			}
			let thisArg = parameters.thisValue;
			if (thisArg && (typeof thisArg === "object" || typeof thisArg === "function")) {
				thisArg = new Proxy(thisArg, {
					get(target: any /*original*/, p: string | symbol, receiver: any /*proxy*/): any {
						if (p === "channel") return channel;
						if (p === "context") return channel.context;
						return Reflect.get(target, p, target);
					}
				});
			}
			return target.apply(thisArg, args);
		}
	}
	
	/**
	 * Create function with validation of arguments
	 * @param normalizer function to normalize arguments. `(args) => boolean | any[]`
	 * - `args` - array of values passed to the handler
	 * - returns:
	 *   - `true` - pass args to the handler
	 *   - `false` - error will be thrown
	 *   - `any[]` - pass the changed args to the handler
	 * - `this` - will be set to the current instance of {@link RPCSource}
	 * - if `normalizer` is a type guard, then the types of arguments of `handler` will be inferred from it.
	 * - if `normalizer` returns `any[]`, then the types of arguments of `handler` will be inferred from it.
	 * - if `normalizer` returns `true`, then the types of arguments of `handler` will be the same as the types of arguments of `normalizer`.
	 * @param handler - target function
	 * @returns a new function that first calls `normalizer`, and if it returns `true` or `any[]`, then calls `handler`.
	 * @example
	 * ```typescript
	 * const normalizeString = (args: any[]) => args.length === 1 && [String(args[0])] as const;
	 *
	 * const fn = RPCSource.normalize(normalizeString, (arg) => {
	 *   return arg.toUpperCase() // <-- string
	 * });
	 *
	 * fn("foo") // "FOO"
	 * fn(10) // "10"
	 * fn(); // throws error
	 * fn("foo", "bar"); // throws error
	 * ```
	 */
	static normalize<
		V extends ((this: RPCSource<any, any>, args: any[]) => boolean | readonly any[]) | ((this: RPCSource<any, any>, args: any[]) => args is any[]),
		A extends (
			this: RPCSource<any, any>,
			...args: (V extends ((args: any[]) => args is infer R extends any[]) ? R : (
				V extends ((args: any[]) => false | infer R extends readonly any[]) ? R : (
					Parameters<V>[0]
				)
			))
		) => any
	>(
		normalizer: V,
		handler: A
	): NoInfer<A> {
		return function (this: any, ...args: any){
			const normalizeResult = (normalizer as any).call(this, args);
			if (Array.isArray(normalizeResult)) {
				return handler.call(this, ...normalizeResult as any);
			}
			if (!normalizeResult) throw new Error("invalid parameters");
			return handler.call(this, ...args);
		} as any;
	}
	
	/**
	 * @deprecated
	 * @see {@link RPCSource.normalize}
	 */
	static validate = this.normalize;
	
	/** apply generic types for events */
	withEventTypes<E = EVENTS>(): RPCSource<METHODS, STATE, E>{
		return this as any;
	}
	
	/** @hidden */
	setState(changeState: (oldState: STATE) => STATE): STATE
	/**
	 * set new state
	 * @param newState
	 * - new state value, if state is not a function.
	 * - function takes the current state and returns a new one
	 */
	setState(newState: STATE extends (...args: any) => any ? never : STATE): STATE
	setState(state: any): STATE {
		if (this.disposed) throw new Error("disposed");
		const newState = typeof state === "function" ? state(this.#state) : state;
		if (this.#state === newState) return newState;
		this.#state = newState;
		this.#innerEvents.emitWithTry("state", newState);
		return newState;
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
	): this {
		if (this.#disposed) throw new Error("disposed");
		const path: (string|number)[] = (typeof event === "string" || typeof event === "number") ? [event] : event;
		this.#innerEvents.emitWithTry("message", path, args);
		return this as any;
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
		{maxChannelsPerClient = Infinity, context, onCreateChannel}: {
			maxChannelsPerClient?: number,
			context?: any,
			onCreateChannel?: (channel: RPCSource.Channel, parentChannel: RPCSource.Channel | undefined) => void
		} = {}
	){
		const channels = new Map<string|number, RPCSource.Channel>
		const subscribers = new Map<RPCSource<any, any, any>, (string|number)[]>
		let sendMessageQueue: RemoteMessage[]|null = [];
		let sendMessage = (...args: RemoteMessage) => {
			sendMessageQueue!.push(args);
		}
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
		const sendMessage_connection = connection(
			(...args) => onMessage(...args),
			(reason) => onClose(reason)
		);
		if (sendMessageQueue) for (let msg of sendMessageQueue) sendMessage_connection(...msg);
		sendMessageQueue = null;
		sendMessage = sendMessage_connection;
		
		function onMessageInitialize(channelId: string) {
			try {
				const channel = new RPCSource.Channel(rpcSource);
				onCreateChannel?.(channel, undefined);
				RPCSource.#initChannel(channel, channelId, sendMessage, channels, subscribers, context, maxChannelsPerClient)
			}  catch (error) {
				try {
					sendMessage([channelId], REMOTE_ACTION.CLOSE, error as any);
				} catch {
					sendMessage([channelId], REMOTE_ACTION.CLOSE, "parse error");
				}
			}
		}
		
		function onMessageNotify(channel: RPCSource.Channel, path: (string|number)[], args: any[]) {
			try {
				channel.source.#handler(channel, path as any[], args as any[], false);
			} catch {}
		}
		
		async function onMessageCallMethod(channel: RPCSource.Channel, channelId: string, callId: any, path: string[], callArgs: any[]) {
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
		
		function onMessageClose(channel: RPCSource.Channel, channelId: string, reason: any) {
			channels.delete(channelId);
			channel?.close(reason);
		}
		
		async function onMessageCreateChannel(channel: RPCSource.Channel, newChannelId: string, path: string[], callArgs: any[]) {
			try {
				const result = await channel.source.#handler(channel, path, callArgs, true);
				let createdChannel: RPCSource.Channel;
				if (result instanceof RPCSource.Channel) {
					createdChannel = result;
				} else if (result instanceof RPCSource) {
					createdChannel = new RPCSource.Channel(result);
				} else {
					throw new Error("wrong data type");
				}
				onCreateChannel?.(createdChannel, channel);
				RPCSource.#initChannel(createdChannel, newChannelId, sendMessage, channels, subscribers, context, maxChannelsPerClient);
			} catch (error) {
				try {
					sendMessage([newChannelId], REMOTE_ACTION.CLOSE, error as any);
				} catch {
					sendMessage([newChannelId], REMOTE_ACTION.CLOSE, "parse error");
				}
			}
			
		}
		
		function closeAll(reason?: any){
			for (const channel of channels.values()) channel.close(reason);
		}
		return closeAll;
	}
	
	static #initChannel(
		channel: RPCSource.Channel<any>,
		channelId: string|number,
		sendMessage: (...args: any[]) => void,
		channels: Map<string|number, RPCSource.Channel>,
		subscribers: Map<RPCSource<any, any, any>, (string|number)[]>,
		context: any,
		maxChannelsPerClient: number
	): boolean {
		if (channels.size >= maxChannelsPerClient) throw new Error("channels limit");
		if (channel.ready) throw new Error("channel is already initialized");
		const accessor = getAccessor(channel);
		if (!accessor) return false;
		const alreadyExistsChannel = channels.get(channelId);
		if (alreadyExistsChannel) {
			alreadyExistsChannel.close("channel id conflict");
			return false;
		}
		return accessor.init({
			channelId,
			sendMessage,
			channels,
			subscribers,
			context,
			disposeReason: channel.source.#disposeReason,
			getEventEmitter: () => channel.source.#innerEvents,
			getAutoDispose: () => channel.source.#autoDispose,
		});
	}
	
	static Channel = RPCSourceChannel;
}

declare namespace RPCSource {
	export type Channel<T extends RPCSource<any, any> = RPCSource<any, any>> = RPCSourceChannel<T>
}

export default RPCSource