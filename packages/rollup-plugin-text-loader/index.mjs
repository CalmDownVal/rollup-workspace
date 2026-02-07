import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_NAME = "TextLoader";
const RE_RELATIVE = /^\.\.?[/\\]/;

/**
 * @typedef {Object} TextLoaderOptions
 * @property {boolean} [loadRaw=true] whether to automatically load imports marked with "?raw" - only works with relative or pre-resolved paths (defaults to true)
 * @property {string|string[]} [include] glob pattern(s) of files to include (optional)
 * @property {string|string[]} [exclude] glob pattern(s) to exclude (optional)
 */

/**
 * @param {TextLoaderOptions} [pluginOptions]
 */
export default function TextLoaderPlugin(pluginOptions) {
	const include = toArray(pluginOptions?.include ?? []);
	const exclude = toArray(pluginOptions?.exclude ?? []);
	const loadAsRaw = new Set();

	const shouldTransform = id => {
		if (loadAsRaw.has(id)) {
			// the import was marked with ?raw
			return true;
		}

		if (!include.some(pattern => path.matchesGlob(id, pattern))) {
			// the import did not match any include pattern
			return false;
		}

		if (exclude.some(pattern => path.matchesGlob(id, pattern))) {
			// the import matched an exclude pattern
			return false;
		}

		return true;
	};

	return {
		name: PLUGIN_NAME,
		resolveId(source, importer) {
			if (pluginOptions?.loadRaw === false) {
				return;
			}

			if (!RE_RELATIVE.test(source) && !path.isAbsolute(source)) {
				return;
			}

			const url = URL.parse(source, pathToFileURL(importer ?? process.cwd()));
			if (!url || url.searchParams.get("raw") === null) {
				return null;
			}

			const id = fileURLToPath(url.href);
			loadAsRaw.add(id);
			return id;
		},
		async transform(code, id) {
			if (!shouldTransform(id)) {
				return null;
			}

			this.addWatchFile(id);
			return {
				code: `export default ${quoteText(code)};`,
				moduleSideEffects: false,
				syntheticNamedExports: false,
				map: { mappings: "" },
			};
		},
	};
}

function toArray(oneOrMore) {
	return Array.isArray(oneOrMore) ? oneOrMore : [ oneOrMore ];
}

function quoteText(text) {
	const { length } = text;
	let result = "";
	let index = 0;
	let anchor = 0;

	for (; index < length; index += 1) {
		if (text[index] === "`") {
			result += text.slice(anchor, index) + "\\`";
			anchor = index + 1;
		}
	}

	return "`\\\n" + result + text.slice(anchor) + "`";
}
