import * as path from "node:path";

import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { parseConfigFileTextToJson } from "typescript";

const PLUGIN_NAME = "BundleDts";

/**
 * @typedef {Object} BundleDtsOptions
 * @property {string} [baseDir] - Base directory of typescript modules (optional, defaults to baseUrl from tsconfig)
 * @property {string} [declarationDir] - Alternative root to look for .d.ts files (optional, defaults to baseDir)
 * @property {string} [tsconfig="./tsconfig.json"] - Path to tsconfig (optional, defaults to "./tsconfig.json")
 * @property {Object} [compilerOptions] - Custom TypeScript compiler options overrides (optional)
 */

/**
 * @param {BundleDtsOptions} pluginOptions
 */
export default function BundleDtsPlugin(pluginOptions) {
	let cwd = undefined;
	let hasRun = false;
	let entries = [];
	let tsconfig = {};
	let baseDir;
	let declDir;

	return {
		name: PLUGIN_NAME,
		async buildStart(rollupOptions) {
			cwd = process.cwd();
			hasRun = false;
			entries = [];
			tsconfig = {};

			// load actual tsconfig
			// FUTURE: this doesn't resolve `extends` (!!!)
			const tsconfigPath = path.resolve(cwd, pluginOptions.tsconfig ?? "./tsconfig.json");
			const tsconfigRaw = await this.fs.readFile(tsconfigPath, "utf8");
			const tsconfigActual = parseConfigFileTextToJson(tsconfigPath, tsconfigRaw);
			if (tsconfigActual.error) {
				throw new Error(`failed to parse tsconfig: ${tsconfigActual.error.messageText}`);
			}

			tsconfig = tsconfigActual.config;

			// determine entries
			baseDir = path.resolve(cwd, pluginOptions.baseDir ?? tsconfig?.compilerOptions?.baseDir ?? "");
			declDir = path.resolve(cwd, pluginOptions.declarationDir ?? baseDir);

			const inputs = getRollupInputs(cwd, rollupOptions.input);
			for (const input of inputs) {
				const declPath = getDeclarationPath(input.inputPath);
				entries.push({
					inputPath: path.join(declDir, path.relative(baseDir, declPath)),
					outputFileName: path.basename(declPath),
				});
			}
		},
		generateBundle(outputOptions) {
			if (hasRun) {
				return;
			}

			const outputDir = outputOptions.dir === undefined
				? path.resolve(cwd, path.dirname(outputOptions.file))
				: path.resolve(cwd, outputOptions.dir);

			for (const entry of entries) {
				entry.outputPath = path.join(outputDir, entry.outputFileName);
				entry.assetId = this.emitFile({
					type: "asset",
					fileName: entry.outputFileName,
					source: "// pending generation\n",
				});
			}
		},
		async writeBundle() {
			if (hasRun) {
				return;
			}

			hasRun = true;

			// fake package info
			const fakePackageJsonPath = path.join(declDir, "package.json");
			const fakeTsconfigJsonPath = path.join(declDir, "tsconfig.json");
			const packageJson = {
				name: "dts",
			};

			// build a fake config
			const tsconfigOverride = {
				...tsconfig,
				compilerOptions: {
					...tsconfig.compilerOptions,
					// override baseUrl to correctly resolve TS' paths mappings
					baseUrl: declDir,
					skipLibCheck: true,
					// apply user overrides
					...pluginOptions.compilerOptions,
				},
				exclude: [],
				include: [ "./**/*.d.ts" ],
			};

			for (const entry of entries) {
				const extractorConfig = ExtractorConfig.prepare({
					packageJsonFullPath: fakePackageJsonPath,
					packageJson,
					configObject: {
						mainEntryPointFilePath: entry.inputPath,
						projectFolder: declDir,
						compiler: {
							overrideTsconfig: tsconfigOverride,
							tsconfigFilePath: fakeTsconfigJsonPath,
							skipLibCheck: true,
						},
						dtsRollup: {
							enabled: true,
							omitTrimmingComments: true,
							publicTrimmedFilePath: entry.outputPath,
						},
					},
				});

				const result = Extractor.invoke(extractorConfig, {
					localBuild: true,
					showVerboseMessages: false,
					messageCallback: message => {
						message.handled = true;
						this.warn({
							code: message.messageId,
							message: message.text,
							loc: {
								column: message.sourceFileColumn,
								line: message.sourceFileLine,
								file: message.sourceFilePath,
							},
						});
					},
				});

				if (!result.succeeded) {
					throw new Error(`failed to bundle types for ${entry.dtsEntryPath}`);
				}
			}
		},
	};
}

const RE_TS = /(?<!\.d)\.(tsx?|[mc]ts)$/i;
const EXT_MAP = {
	js: ".d.ts",
	jsx: ".d.ts",
	mjs: ".d.mts",
	cjs: ".d.cts",
	ts: ".d.ts",
	tsx: ".d.ts",
	mts: ".d.mts",
	cts: ".d.cts",
};

function parseTypeScriptPath(path) {
	const match = RE_TS.exec(path);
	return match
		? {
			base: path.slice(0, match.index),
			ext: match[1].toLowerCase(),
		}
		: null;
}

function getDeclarationPath(path) {
	const ts = parseTypeScriptPath(path);
	if (!ts) {
		return `${path}.d.ts`;
	}

	return `${ts.base}${EXT_MAP[ts.ext] ?? ".d.ts"}`;
}

function getRollupInputs(cwd, input) {
	switch (typeof input) {
		case "string":
			return [ getRollupInput(cwd, input) ];

		case "object":
			return Array.isArray(input)
				? input.map(file => getRollupInput(cwd, file))
				: Object.keys(input).map(name => getRollupInput(cwd, input[name], name));
	}
}

function getRollupInput(cwd, file, name) {
	return {
		name: name ?? path.parse(file).name,
		inputPath: path.resolve(cwd, file),
	};
}
