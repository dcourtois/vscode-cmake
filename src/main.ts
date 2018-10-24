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
export function activate(context: vscode.ExtensionContext) {

	// initialize everything (the order is kind of important)
	utils.initialize(context);
	logger.initialize();
	kits.initialize(context);
	commands.initialize();
	cmake.initialize(context);
	diagnostics.initialize();
	status.initialize();

}
