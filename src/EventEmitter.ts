export default class EventEmitter<M extends Record<string, any[]> = Record<string, any[]>> {
	#eventMap: {[E in keyof M]?: {listener: (...args: M[E]) => void, context: any, once?: boolean}[]} = {};
	constructor(){
		const emitter = this;
		Object.assign(this, {
			on<E extends keyof M>(eventName: E, listener: (...args: M[E]) => void): any{
				let list = emitter.#eventMap[eventName]
				if (!list) list = emitter.#eventMap[eventName] = [];
				list.push({listener, context: this});
				return this;
			},
			once<E extends keyof M>(eventName: E, listener: (...args: M[E]) => void): any{
				let list = emitter.#eventMap[eventName]
				if (!list) list = emitter.#eventMap[eventName] = [];
				list.push({listener, context: this, once: true});
				return this;
			},
			off<E extends keyof M>(eventName: E, listener: (...args: M[E]) => void): any{
				if (!listener){
					delete emitter.#eventMap[eventName];
					return this;
				}
				let list: {listener: any, context: any, once?: boolean}[]|undefined = emitter.#eventMap[eventName];
				if (!list) return this;
				const index = list.findIndex(item => item.listener === listener);
				if (index !== -1) list.splice(index, 1);
				return this;
			}
		});
	}
	declare on: <E extends keyof M, T>(this: T, eventName: E, listener: (this: T, ...args: M[E]) => void) => T;
	declare once: <E extends keyof M, T>(this: T, eventName: E, listener: (this: T, ...args: M[E]) => void) => T;
	declare off: <E extends keyof M, T>(this: T, eventName: E, listener: (this: T, ...args: M[E]) => void) => T;
	
	emit<E extends keyof M>(eventName: E, ...args: M[E]): boolean {
		let list = this.#eventMap[eventName]?.slice(0);
		if (!list || list.length === 0) return false;
		for (const {listener, once, context} of list){
			if (once) this.off(eventName as any, listener);
			listener.apply(context, args);
		}
		return true;
	}
	
	emitWithTry<E extends keyof M>(eventName: E, ...args: M[E]): boolean {
		let list = this.#eventMap[eventName]?.slice(0);
		if (!list || list.length === 0) return false;
		for (const {listener, once, context} of list) try {
			if (once) this.off(eventName as any, listener);
			listener.apply(context, args);
		} catch {}
		return true;
	}
}