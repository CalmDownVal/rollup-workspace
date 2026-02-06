import type { OutputOptions } from "rolldown";

import { createEntity, type Entity, type NameOf } from "./Entity";
import { createEntityContainer, type EntityContainer, type EntityMap } from "./EntityContainer";
import type { AnyPluginDeclaration } from "./PluginDefinition";

export type OutputDefinition<
	TName extends string,
	TConfig extends OutputConfig,
	TPlugins extends EntityMap<AnyPluginDeclaration>,
> = Entity<TName, TConfig, {
	readonly plugins: TPlugins;

	/** @internal */
	readonly pluginContainer: EntityContainer<AnyPluginDeclaration, TPlugins>;

	plugin<TPlugin extends AnyPluginDeclaration>(
		plugin: TPlugin,
	): OutputDefinition<TName, TConfig, TPlugins & { [K in NameOf<TPlugin>]: TPlugin }>;
}>;

export interface OutputConfig extends OutputOptions {
	[key: string]: unknown;
}

export type AnyOutputDeclaration = (
	OutputDefinition<any, any, any>
);

export function defineOutput<TName extends string, TConfig extends OutputConfig>(
	name: TName,
): OutputDefinition<TName, TConfig, {}> {
	const pluginContainer = createEntityContainer<AnyPluginDeclaration>("Plugin");
	return createEntity(name, {
		plugins: pluginContainer.entityMap,
		pluginContainer,
		finalize: onFinalize,
		plugin: onPlugin,
	});
}

function onFinalize(
	this: AnyOutputDeclaration,
): AnyOutputDeclaration {
	const pluginContainer = this.pluginContainer.finalize();
	return {
		...this,
		isFinal: true,
		plugins: pluginContainer.entityMap,
		pluginContainer,
	};
}

function onPlugin(
	this: AnyOutputDeclaration,
	plugin: AnyPluginDeclaration,
): AnyOutputDeclaration {
	if (this.isFinal) {
		this.pluginContainer.add(plugin);
		return this;
	}

	const pluginContainer = this.pluginContainer.add(plugin);
	return {
		...this,
		plugins: pluginContainer.entityMap,
		pluginContainer,
	};
}
