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

	//! Optional env var
	public env: object;

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
			[ "-format", "json", "-utf8" ],
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

				// run vcvars64.bat and get the environment variables which are needed to build something
				const vars = await getMSVCVars(
					context,
					utils.normalizePath(installDir, "VC\\Auxiliary\\Build\\vcvars64.bat")
				);

				// add the compiler
				_kits.push({
					"name": install["displayName"],
					"compiler": utils.normalizePath(installDir, "VC\\Tools\\MSVC", version, "bin\\HostX64\\x64\\cl.exe"),
					"linker": utils.normalizePath(installDir, "VC\\Tools\\MSVC", version, "bin\\HostX64\\x64\\link.exe"),
					"options": [ "/verbosity:minimal" ],
					"env": vars
				});

			} else {

				// not supported for the moment

			}

		}

	}

	// log
	if (_kits.length === 0) {
		logger.debug("no kits found");
	} else {
		logger.debug(`found ${_kits.length} kit${_kits.length > 0 ? "s" : ""}:`);
		for (const kit of _kits) {
			logger.debug(`  ${kit.name}`);
			logger.debug(`    ${kit.compiler}`);
			logger.debug(`    ${kit.linker}`);
		}
	}

	// if we only have 1 kit, select it
	if (_kits.length === 1) {
		utils.settings.set("kit", _kits[0].name);
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
 * Get a kit by name
 */
export function getKit(name: string): Kit | undefined {
	for (const kit of _kits) {
		if (kit.name === name) {
			return kit;
		}
	}
	return undefined;
}

/**
 * Private helper used to retrieve the environment variables needed by MSVC.
 *
 * @param context
 * 	Extension context, to get the path to the res folder
 *
 * @param vcvars
 */
async function getMSVCVars(context: vscode.ExtensionContext, vcvars: string): Promise< object > {
	// run
	const vars = await utils.execute(
		"getMSVCVars.bat",
		[ vcvars, "/no_logo" ],
		{ "cwd": path.join(context.extensionPath, "res") }
	);

	// check that we have the first marker
	const beforeMarker = vars.stdout.indexOf("<<<before>>>");
	if (beforeMarker == -1) {
		return null;
	}

	// the banner
	const bannerMarker = vars.stdout.indexOf("<<<banner>>>");
	if (bannerMarker == -1) {
		return null;
	}

	// and the second marker
	const afterMarker = vars.stdout.indexOf("<<<after>>>");
	if (afterMarker == -1) {
		return null;
	}

	// extract the env vars
	const beforeVars = vars.stdout.substr(beforeMarker + 12, bannerMarker - beforeMarker - 12).split("\n");
	const afterVars = vars.stdout.substr(afterMarker + 11).split("\n");

	// parse them and create a map
	const before = new Map();
	for (const line of beforeVars) {
		const eq = line.indexOf("=");
		if (eq !== -1) {
			before.set(line.substr(0, eq).trim(), line.substr(eq + 1).trim());
		}
	}

	// do the same for the modified vars, but only add the new vars
	const after = {};
	for (const line of afterVars) {
		const eq = line.indexOf("=");
		if (eq !== -1) {
			const varName = line.substr(0, eq).trim();
			if (varName.toLowerCase() === "path" || before.has(varName) === false) {
				after[varName] = line.substr(eq + 1).trim();
			}
		}
	}

	return after;
}
