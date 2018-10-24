"use strict";


import * as vscode from "vscode";
import * as utils from "./utils";


/**
 * Extension context.
 */
let _context: vscode.ExtensionContext;

/**
 * Get the kit text to display in the status bar
 */
function getKit(value?: string): string {
	return `kit: ${value || "undefined"}`;
}

/**
 * Get the configuration text to display in the status bar
 */
function getConfiguration(value?: string): string {
	return `config: ${value || "undefined"}`;
}

/**
 * Get the target text to display in the status bar
 */
function getTarget(value?: string): string {
	return `target: ${value || "undefined"}`;
}

/**
 * Initialization method. Call once only.
 */
export function initialize() {
	// create the status bar item for the kits configuration
	const kit = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
	kit.command	= "simplecmake.kit";
	kit.text	= getKit();
	kit.tooltip	= "Current kit";
	kit.show();
	utils.settings.on("kit", (value) => { kit.text = getKit(value); });
	utils.addDisposable(kit);

	// create the status bar item for the build configuration
	const configuration = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
	configuration.command	= "simplecmake.configuration";
	configuration.text		= getConfiguration();
	configuration.tooltip	= "Current build configuration";
	configuration.show();
	utils.settings.on("configuration", (value) => { configuration.text = getConfiguration(value); });
	utils.addDisposable(configuration);

	// create the status bar item for the target
	const target = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	target.command	= "simplecmake.target";
	target.text		= getTarget();
	target.tooltip	= "Current build target";
	target.show();
	utils.settings.on("target", (value) => { target.text = getTarget(value); });
	utils.addDisposable(target);
}
