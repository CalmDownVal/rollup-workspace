export interface FileSystem {
	glob: (
		patterns: string | readonly string[],
		options: GlobOptions,
	) => AsyncIterableIterator<string, undefined, any>;

	readFile: (
		path: string,
		encoding: "utf8",
	) => Promise<string>;

	watch: (
		path: string,
	) => Watcher;
}

export interface GlobOptions {
	cwd: string;
}

export interface Watcher {
	close: () => void;
	on: (type: "change" | "error", listener: () => void) => void;
}

export async function getNodeFileSystem(): Promise<FileSystem> {
	const fsCallbacks = await import("node:fs");
	const fsPromises = await import("node:fs/promises");
	return {
		glob: fsPromises.glob,
		readFile: fsPromises.readFile,
		watch: fsCallbacks.watch,
	};
}
