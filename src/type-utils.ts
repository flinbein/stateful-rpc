export interface MetaScopeValue<M  = any, E  = any, S = any> {
	[Symbol.unscopables]: {
		__rpc_methods: M,
		__rpc_events: E,
		__rpc_state: S
	}
}
export interface MetaScope<M  = any, E  = any, S = any> {
	[Symbol.unscopables]: MetaScopeValue<M, E, S>
}


export type EventPath<T, K extends keyof T = keyof T> = (
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

export type EventPathArgs<PATH extends number|string|(number|string)[], FORM> = (
	0 extends (1 & FORM) ? any[] :
		PATH extends (number|string) ? EventPathArgs<[PATH], FORM> :
			PATH extends [] ? FORM extends any[] ? 0 extends (1 & FORM) ? any[] : FORM : never :
				PATH extends [infer PROP, ...infer TAIL extends (number|string)[]] ? (
					PROP extends keyof FORM ? EventPathArgs<TAIL, FORM[PROP]> : never
					) : never
	);