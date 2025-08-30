import type { UserConfig } from 'vite'
// @ts-ignore
import dts from 'unplugin-dts/vite'

export default {
	build: {
		lib: {
			entry: {
				'index': 'src/index.ts',
				'RPCChannel': 'src/RPCChannel.ts',
				'RPCSource': 'src/RPCSource.ts',
			},
		},
	},
	plugins: [dts({
		exclude: ["src/EventEmitter.ts", "src/RPCSourceChannelAccessor.ts"],
	})]
} satisfies UserConfig;