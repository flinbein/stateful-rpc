import RPCSource from "../src/RPCSource.js";
import RPCChannel from "../src/RPCChannel.js";

/**
 * Creates a factory function for RPCChannel instances connected to the given RPCSource.
 * Each channel created by the factory will have a unique channel ID.
 * @param rpcSource
 * @param abort Optional AbortSignal to close the connection when aborted.
 * @returns A factory function that creates new RPCChannel instances. All channels share the same RPCSource.
 */
export function createChannelFactory<T extends RPCSource<any, any>>(rpcSource: T, abort?: AbortSignal): () => RPCChannel<T> {
	const getNextChannelId = ((id = 0) => () => id++)();
	let sendToSource: (...message: any[]) => void;
	let channelsSendFunctions = new Set<(...message: any[]) => void>;
	const sendToAllChannels = (...message: any[]) => {
		for (let channelSend of channelsSendFunctions) channelSend(...message);
	}
	
	const createChannel = () => new RPCChannel<T>((send, close) => {
		channelsSendFunctions.add(send);
		abort?.addEventListener("abort", () => close(abort.reason), {once: true});
		return (...message) => setImmediate(() => sendToSource(...message));
	}, {getNextChannelId});
	
	RPCSource.start(rpcSource, (send, close) => {
		sendToSource = send;
		abort?.addEventListener("abort", () => close(abort.reason), {once: true});
		return (...message) => setImmediate(() => sendToAllChannels(...message));
	}, {context: createChannel});
	
	return createChannel;
}
