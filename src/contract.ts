export const enum CLIENT_ACTION {
	CALL = 0,
	CLOSE = 1,
	CREATE = 2,
	NOTIFY = 3,
}

export const enum REMOTE_ACTION {
	RESPONSE_OK = 0,
	CLOSE = 1,
	STATE = 2,
	RESPONSE_ERROR = 3,
	EVENT = 4
}

export type ClientMessageInitialize = [
	channelId: number|string,
]

export type ChannelMessageCall = [
	channelId: number|string,
	action: CLIENT_ACTION.CALL, // 0
	responseKey: any, // room will respond with this key
	path: string[], // path to remote function
	arguments: any[] // call function with these arguments
]

export type ClientMessageNotify = [
	channelId: number|string,
	action: CLIENT_ACTION.NOTIFY, // 3
	path: string[], // path to remote function
	arguments: any[] // call function with these arguments
]

export type ClientMessageClose = [
	channelId: number|string,
	action: CLIENT_ACTION.CLOSE, // 1
	reason: any
]

export type ClientMessageCreate = [
	channelId: number|string,
	action: CLIENT_ACTION.CREATE, // 2
	newChannelId: number, // room will respond with this key
	path: string[], // path to remote constructor
	arguments: any[] // call constructor with these arguments
]

export type ClientMessage = ClientMessageInitialize | ChannelMessageCall | ClientMessageClose | ClientMessageCreate | ClientMessageNotify;

//////////////////////////////

export type RemoteMessageCallResult = [
	channelId: (number|string)[],
	action: REMOTE_ACTION.RESPONSE_OK | REMOTE_ACTION.RESPONSE_ERROR, // 0 | 3
	responseKey: any, // from ChannelMessageCall
	result: any, // result of function call or error
]

export type RemoteMessageChannelClosed = [
	channelId: (number|string)[],
	action: REMOTE_ACTION.CLOSE, // 1
	closeReason: any, // reason for closing
]

export type RemoteMessageChannelState = [
	channelId: (number|string)[],
	action: REMOTE_ACTION.STATE, // 2
	state: any, // state value of a channel
]

export type RemoteMessageChannelEvent = [
	channelId: (number|string)[],
	action: REMOTE_ACTION.EVENT, // 4
	eventPath: (number|string)[], // path to subscriber, event name included
	eventData: any[]
]

export type RemoteMessage = RemoteMessageCallResult | RemoteMessageChannelClosed | RemoteMessageChannelState | RemoteMessageChannelEvent;