import type RPCSource from "./RPCSource.js";
import type RPCSourceChannel from "./RPCSourceChannel.js";
import EventEmitter from "./EventEmitter.js";

export type RPCSourceChannelInitData = {
	channelId: string|number,
	sendMessage: (...args: any[]) => void,
	channels: Map<string|number, RPCSourceChannel<any>>,
	subscribers: Map<RPCSource<any, any, any>, (string|number)[]>,
	context: any
	disposeReason: any;
	getEventEmitter: () => EventEmitter;
	getAutoDispose: () => boolean;
}
type RPCSourceChannelAccessor = {
	init: (data: RPCSourceChannelInitData) => boolean;
}

const accessorWeakMap = new WeakMap<RPCSourceChannel<any>, RPCSourceChannelAccessor>();
export function registerAccessor(sourceChannel: RPCSourceChannel<any>, accessor: RPCSourceChannelAccessor){
	accessorWeakMap.set(sourceChannel, accessor);
}

export function getAccessor(sourceChannel: RPCSourceChannel<any>): RPCSourceChannelAccessor | undefined {
	return accessorWeakMap.get(sourceChannel);
}