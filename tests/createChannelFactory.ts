import RPCSource from "../src/RPCSource.js";
import RPCChannel from "../src/RPCChannel.js";

export function createChannelFactory<T extends RPCSource<any, any>>(rpcSource: T, params: {
	signal?: AbortSignal,
	onCreateChannel?: (channel: RPCSource.Channel, parentChannel: RPCSource.Channel | undefined) => void
	maxChannelsPerClient?: number
} = {}) {
	const { signal, onCreateChannel, maxChannelsPerClient = Infinity } = params;
	const getNextChannelIdNumber = ((id = 0) => () => id++)();
	let sendToSource: (...message: any[]) => void;
	let channelsSendFunctions = new Set<(...message: any[]) => void>;
	const sendToAllChannels = (...message: any[]) => {
		for (let channelSend of channelsSendFunctions) channelSend(...message);
	}
	
	const createChannel = (params: {
		messageLog?: {in: any[], out: any[]}
		getNextChannelId?: () => string | number
		connectionTimeout?: number | AbortSignal
	} = {}) => new RPCChannel<T>((
		send, close
	) => {
		const { messageLog } = params;
		if (messageLog) channelsSendFunctions.add((...args) => messageLog.out.push(args));
		channelsSendFunctions.add(send);
		signal?.addEventListener("abort", () => close(signal.reason), {once: true});
		return (...message) => setImmediate(() => {
			if (messageLog) messageLog.in.push(message);
			sendToSource(...message)
		});
	}, {
		getNextChannelId: params?.getNextChannelId ?? getNextChannelIdNumber,
		connectionTimeout: params?.connectionTimeout,
	});
	
	createChannel.close = RPCSource.start(rpcSource, (send, close) => {
		sendToSource = send;
		signal?.addEventListener("abort", () => close(signal.reason), {once: true});
		return (...message) => setImmediate(() => sendToAllChannels(...message));
	}, {context: createChannel, onCreateChannel, maxChannelsPerClient});
	
	return createChannel;
}
