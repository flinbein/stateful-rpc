import type { UserConfig } from 'vite'
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
		exclude: ["src/EventEmitter.ts"],
	})]
} satisfies UserConfig;