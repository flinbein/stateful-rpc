# RPC contract

---

## Client to Room

### Initialize RPC
```typescript
type ClientInitialize = [
  channelId: number|string,
]
```

### Call remote method
```typescript
type ClientMessageCall = [
  channelId: number|string,
  action: CLIENT_ACTION.CALL, // 0
  responseKey: any, // room will respond with this key
  path: string[], // path to remote function
  arguments: any[] // call function with this arguments  
]
```
Handler will respond with:
* [HandlerMessageCallResult](#method-call-result) if channel exists.
* [HandlerMessageChannelClosed](#channel-closed) if channel closed or not exists.

### Notify
```typescript
type ClientMessageNotify = [
  channelId: number|string,
  action: CLIENT_ACTION.NOTIFY, // 3
  path: string[], // path to remote function
  arguments: any[] // call function with this arguments  
]
```
No response for this message. Even if handler throws an exception.

Handler will respond with:
* [HandlerMessageChannelState](#channel-created-or-state-updated) if channel exists.
* [HandlerMessageChannelClosed](#channel-closed) if channel closed or not exists.


### Close channel
default channel can not be closed;
```typescript
type ClientMessageClose = [
  channelId: number|string,
  action: CLIENT_ACTION.CLOSE, // 1
  reason: any // call function with this arguments
]
```
No response is expected from the handler.

### Create new channel
```typescript
type ClientMessageCreate = [
  channelId: number|string,
  action: CLIENT_ACTION.CREATE, // 2 
  newChannelId: number, // room will respond with this key
  path: string[], // path to remote constructor
  arguments: any[] // call constructor with this arguments   
]
```
handler will respond with:
* [HandlerMessageChannelState](#channel-created-or-state-updated) on success
* [HandlerMessageChannelClosed](#channel-closed) on error


---

## Room to Client

### Method call result
```typescript
type HandlerMessageCallResult = [
  channelId: (number|string)[],
  action: REMOTE_ACTION.RESPONSE_OK | REMOTE_ACTION.RESPONSE_ERROR, // 0 | 3
  responseKey: any, // from ClientMessageCall
  result: any, // result of function call or error
]
```

### Channel closed
default channel can not be closed;
```typescript
type HandlerMessageChannelClosed = [
  channelId: (number|string)[],
  action: REMOTE_ACTION.CLOSE, // 1
  closeReason: any, // result of function call or error
]
```

### Channel created or state updated
```typescript
type HandlerMessageChannelState = [
  channelId: (number|string)[],
  action: REMOTE_ACTION.STATE, // 2 
  state: any, // state value of channel
]
```

### Channel emit event
```typescript
type HandlerMessageChannelEvent = [
  channelId: (number|string)[],
  action: REMOTE_ACTION.EVENT, // 4
  eventPath: string[], // path to subsciber, event name included
  eventData: any[]
]
```