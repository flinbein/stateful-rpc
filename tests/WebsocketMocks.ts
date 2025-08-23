type TypedArray =
	| Int8Array /*07*/ | Int16Array /*08*/ | Int32Array /*09*/
	| Uint8Array  /*0a*/ | Uint16Array  /*0b*/ | Uint32Array  /*0c*/ | Uint8ClampedArray  /*0d*/
	| Float32Array  /*0e*/ | Float64Array  /*0f*/ | BigInt64Array  /*10*/ | BigUint64Array  /*11*/
;

export class MockEvent extends Event {
	constructor(type: string, fields: Record<string, any> = {}) {
		super(type);
		for (let fieldsKey in fields) {
			(this as any)[fieldsKey] = fields[fieldsKey];
		}
	}
}

export class WebSocketMock extends (EventTarget as any as typeof WebSocket) implements WebSocket, Disposable {
	static readonly CLOSED = 3
	static readonly CLOSING = 2
	static readonly CONNECTING = 0
	static readonly OPEN = 1
	
	binaryType: "blob"| "arraybuffer" = "blob";
	readyState: number = WebSocketMock.CONNECTING;
	url: string = "/mock/url"
	readonly backend: WebSocketBackendMock;
	#resolver = Promise.withResolvers<this>();
	#closeResolver = Promise.withResolvers<this>();
	readonly promise: Promise<this> = this.#resolver.promise;
	readonly closePromise: Promise<this> = this.#closeResolver.promise;
	
	constructor(open?: boolean) {
		super("");
		this.#resolver.promise.catch(() => {});
		this.backend = new WebSocketBackendMock(this, open ?? false);
		if (open) {
			this.readyState = WebSocketMock.OPEN;
			this.#resolver.resolve(this);
		} else {
			this.addEventListener("open", () => this.#resolver.resolve(this));
		}
		this.addEventListener("close", (event: any) => {
			if (this.readyState === WebSocketMock.CONNECTING) {
				this.dispatchEvent(new MockEvent("error", {}))
			}
			this.readyState = WebSocketMock.CLOSED;
			this.#resolver.reject(event);
			this.#closeResolver.resolve(this);
		})
	}
	
	close(code?: number, reason?: string){
		if (this.readyState === WebSocketMock.CLOSING ||this.readyState === WebSocketMock.CLOSED) return;
		this.readyState = WebSocketMock.CLOSING;
		setTimeout(() => {
			const close = new MockEvent("close", {code, reason});
			this.readyState = WebSocketMock.CLOSED;
			this.backend.dispatchEvent(close);
			this.dispatchEvent(close);
		}, 10);
	}
	
	send(message: Uint8Array) {
		if(this.readyState === WebSocketMock.CONNECTING) throw new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
		if (this.readyState !== WebSocketMock.OPEN) return;
		convertMessageToData(message, this.backend.binaryType).then((data) => {
			setTimeout(() => {
				this.backend.dispatchEvent(new MockEvent("message", {data}));
			}, 10);
		});
	}
	
	[Symbol.dispose](){
		this.close(4000, "disposed");
	}
	
	readonly CLOSED = 3;
	readonly CLOSING = 2;
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly bufferedAmount: number = 0;
	readonly extensions: string = "";
	onclose = null;
	onerror = null;
	onmessage = null;
	onopen = null;
	readonly protocol = "";
}

class WebSocketBackendMock extends (EventTarget as any as typeof WebSocket) implements WebSocket {
	binaryType: "blob"| "arraybuffer" = "arraybuffer"
	readyState: number = WebSocketMock.CONNECTING;
	url: string = "/mock/url"
	
	constructor(private client: WebSocketMock, open: boolean) {
		super("");
		if (open) this.readyState = WebSocketMock.OPEN;
		this.addEventListener("close", (event) => {
			if (this.readyState === WebSocketMock.CONNECTING) {
				this.dispatchEvent(new MockEvent("error", {}));
			}
			this.readyState = WebSocketMock.CLOSED;
		})
	}
	
	open(){
		if (this.readyState !== WebSocketMock.CONNECTING) return;
		this.client.readyState = WebSocketMock.OPEN;
		this.readyState = WebSocketMock.OPEN;
		const openEvent = new MockEvent("open");
		this.client.dispatchEvent(openEvent);
		this.dispatchEvent(openEvent);
	}
	
	close(code?: number, reason?: string){
		if (this.readyState === WebSocketMock.CLOSING ||this.readyState === WebSocketMock.CLOSED) return;
		this.readyState = WebSocketMock.CLOSING;
		setTimeout(() => {
			const closeEvent = new MockEvent("close", {code, reason});
			this.readyState = WebSocketMock.CLOSED;
			this.dispatchEvent(closeEvent);
			this.client.dispatchEvent(closeEvent);
		}, 10);
	}
	
	send(message: ArrayBuffer | Blob | string | TypedArray){
		if (this.readyState === WebSocketMock.CONNECTING) throw new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
		if (this.readyState !== WebSocketMock.OPEN) return;
		convertMessageToData(message, this.client.binaryType).then((data) => {
			setTimeout(() => {
				this.client.dispatchEvent(new MockEvent("message", {data}));
			}, 10);
		});
	}
	
	readonly CLOSED = 3;
	readonly CLOSING = 2;
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly bufferedAmount: number = 0;
	readonly extensions: string = "";
	onclose = null;
	onerror = null;
	onmessage = null;
	onopen = null;
	readonly protocol = "";
}

async function convertMessageToData(message: ArrayBuffer | Blob | string | TypedArray, binaryType: "blob"| "arraybuffer" = "blob"): Promise<string | ArrayBuffer | Blob>{
	if (typeof message === "string") return message;
	let data: ArrayBuffer;
	if (message instanceof ArrayBuffer) data = message;
	else if (message instanceof Blob) data = await message.arrayBuffer();
	else if (message?.buffer) data = message.buffer.slice(message.byteOffset, message.byteLength) as ArrayBuffer;
	else throw new Error("send data of unknown type");
	if (binaryType === "blob") return new Blob([data]);
	return data;
}