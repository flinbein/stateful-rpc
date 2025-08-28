import RPCSource from "../src/RPCSource.js";

export function ping(){
	return "pong";
}

export const math = {
	pow: Math.pow
}

export class Store extends RPCSource.with("$")<string> {
	$echo(value: string){
		return value;
	}
}