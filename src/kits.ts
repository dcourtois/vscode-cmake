"use strict";


/**
 * @module kits
 *
 * This module handles detection of compilers.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

import * as logger from "./logger";
import * as utils from "./utils";


/**
 * Define a kit
 */
export class Kit {

	//! The name of the kit
	public name: string;

	//! The absolute path to the compiler
	public compiler: string;

	//! The absolute path to the linker
	public linker: string;

	//! List of optional arguments to invoke when building
	public options: string[];

};

/**
 * The registered kits. The list is set in `initialize`
 */
const _kits: Kit[] = [];

/**
 * Initialize the module. Call only once
 *
 * @param context
 * 	The current extension context.
 */
export async function initialize(context: vscode.ExtensionContext) {

	// register the kit setting
	utils.settings.register("kit");

	// check the platform
	if (os.platform() === "win32") {

		// use vswhere to find Visual Studio installations
		const result = await utils.execute(
			"vswhere",
			[ "-legacy", "-format", "json", "-utf8" ],
			{ "cwd": path.join(context.extensionPath, "res") }
		);

		// parse the result of vswhere
		const installs = JSON.parse(result.stdout);
		for (const install of installs) {

			// recent (vs2017) versions of Visual Studio have a display name, the others don't
			if (install["displayName"] !== undefined) {

				// installation dir
				const installDir = install["installationPath"];

				// the VCTools version is in a text file
				const versionFile = utils.normalizePath(installDir, "VC\\Auxiliary\\Build\\Microsoft.VCToolsVersion.default.txt");
				const version = fs.readFileSync(versionFile).toString().trim();

				// add the compiler
				_kits.push({
					"name": install["displayName"],
					"compiler": utils.normalizePath(install["installationPath"], "VC\\Tools\\MSVC", version, "bin\\HostX64\\x64\\cl.exe"),
					"linker": utils.normalizePath(install["installationPath"], "VC\\Tools\\MSVC", version, "bin\\HostX64\\x64\\link.exe"),
					"options": [
						"/verbosity:minimal"
					]
				});

			} else {

				// not supported for the moment

			}

		}

		// log
		if (_kits.length === 0) {
			logger.log("No kits found");
		} else {
			logger.log(`Found ${_kits.length} kit${_kits.length > 0 ? "s" : ""}:`);
			for (const kit of _kits) {
				logger.log(`  ${kit.name}`);
				logger.log(`    ${kit.compiler}`);
				logger.log(`    ${kit.linker}`);
			}
		}

		// if we only have 1 kit, select it
		if (_kits.length === 1) {
			utils.settings.set("kit", _kits[0].name);
		}

	}

}

/**
 * Get the list of registered kits
 */
export function getKits(): string[] {
	const kits: string[] = [];
	for (const kit of _kits) {
		kits.push(kit.name);
	}
	return kits;
}

/**
 * Get a kit by name. Asserts if the kit doesn't exist
 */
export function getKit(name: string): Kit | undefined {
	for (const kit of _kits) {
		if (kit.name === name) {
			return kit;
		}
	}
	return undefined;
}
