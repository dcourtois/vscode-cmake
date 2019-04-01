"use strict";


import * as vscode from "vscode";

import * as utils from "./utils";
import * as logger from "./logger";
import * as kits from "./kits";
import * as commands from "./commands";
import * as cmake from "./cmake";
import * as diagnostics from "./diagnostics";
import * as status from "./status";


/**
 * Called once on extension's activation
 */
export async function activate(context: vscode.ExtensionContext) {

	// initialize everything (the order is of important, some modules assume that other ones
	// already are correctly initialized)
	utils.initialize(context);
	logger.initialize();
	commands.initialize();
	await kits.initialize(context);
	cmake.initialize(context);
	diagnostics.initialize();
	status.initialize();

}
