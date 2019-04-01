"use strict";


/**
 * @module generators
 *
 * This module handles detection of supported generators.
 */

import * as os from "os";


/**
 * Define a generator
 */
export class Generator {

	//! The name of the kit
	public name: string;

	//! List of optional arguments to invoke when building
	public options: string[] = [];

};

/**
 * The supported generators. It's initialized in the initialize method.
 */
const _generators: Generator[] = [];

/**
 * Initialize the list of generators. This is called after a globalSettings message has
 * been received from CMake server.
 *
 * @param generators
 * 	The list of generators as retreived from CMake. Currently not used.
 */
export async function initialize(generators) {

	switch (os.platform()) {

		// windows generators
		case "win32":
			_generators.push({
				"name": "Visual Studio 15 2017 Win64",
				"options": [ "/nologo", "/verbosity:quiet" ]
			});

			// fallthrough, we also want Ninja

		// other platforms, Ninja only
		default:
			_generators.push({
				"name": "Ninja",
				"options": []
			});
	}

}

/**
 * Get the list of registered kits
 */
export function getGenerators(): string[] {
	const generators: string[] = [];
	for (const generator of _generators) {
		generators.push(generator.name);
	}
	return generators;
}

/**
 * Get a kit by name. Asserts if the kit doesn't exist
 */
export function getGenerator(name: string): Generator {
	for (const generator of _generators) {
		if (generator.name === name) {
			return generator;
		}
	}
	return undefined;
}
