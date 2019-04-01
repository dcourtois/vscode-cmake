"use strict";


/**
 * @module commands
 *
 * This module provides an easy (as in lazy) way to register and manage vscode commands.
 *
 * It basically exposes a initialize method which needs to be called once when the addon
 * is loaded, and then everything happens inside CommandCenter.
 *
 * Each command registered in CommandCenter is a thin wrapper on the implementation which
 * is usually found somewhere else (for instance, CMake related commands' implementations
 * are in the cmake.ts module, etc.)
 */


import * as vscode from "vscode";
import * as cmake from "./cmake";
import * as utils from "./utils";
import * as kits from "./kits";
import * as logger from "./logger";


/**
 * Initialize the module. Call only once when the addon is loaded. This will
 * create an instance of CommandCenter, and automatically add it to the list
 * of disposables.
 */
export function initialize() {
	console.assert(initialized === false, "commands module already initialized");
	utils.addDisposable(new CommandCenter());
	initialized = true;
}

/**
 * true when the module is initialized, false otherwise
 */
let initialized: boolean = false;

/**
 * Decorator to register commands
 */
function command(id: string): Function {
	return function(target: any, key: string, descriptor: any): any {
		// validation
		if (typeof descriptor.value !== "function") {
			throw new Error("@command decorator only supported on functions");
		}

		// register the command
		CommandCenter.register(id, descriptor.value);

		// return the descriptor unmodified
		return descriptor;
	}
}

/**
 * Stores a command to register
 */
interface Command {
	/**
	 * Id of the command
	 */
	id: string;

	/**
	 * Method to call
	 */
	method: any;
};

/**
 * Command center
 */
class CommandCenter implements vscode.Disposable {

	/**
	 * registered commands
	 */
	private static commands: Command[] = [];

	/**
	 * Constructor
	 */
	constructor() {
		// register our commands
		for (let command of CommandCenter.commands) {
			utils.addDisposable(vscode.commands.registerCommand(
				"simplecmake." + command.id,
				command.method
			));
		}
	}

	/**
	 * Dispose
	 */
	public dispose() {
		console.assert(initialized === true, "commands module already disposed of");
		CommandCenter.commands = [];
		initialized = false;
	}

	/**
	 * Register a command
	 */
	public static register(id: string, method: Function) {
		CommandCenter.commands.push({
			"id": id,
			"method": method
		});
	}

	/**
	 * Configure the project
	 */
	@command("configure")
	async configure() {
		logger.debug("simplecmake.configure command called");
		cmake.configure();
	}

	/**
	 * Reconfigure the project
	 */
	@command("reconfigure")
	async reconfigure() {
		logger.debug("simplecmake.reconfigure command called");
		cmake.configure(true);
	}

	/**
	 * Build the project
	 */
	@command("build")
	async build() {
		logger.debug("simplecmake.build command called");
		cmake.build();
	}

	/**
	 * Clean the project
	 */
	@command("clean")
	async clean() {
		logger.debug("simplecmake.clean command called");
		cmake.clean();
	}

	/**
	 * Nuke the build folder
	 */
	@command("nuke")
	async nuke() {
		logger.debug("simplecmake.nuke command called");
		cmake.nuke();
	}

	/**
	 * Install the project
	 */
	@command("install")
	async install() {
		logger.debug("simplecmake.install command called");
		cmake.install();
	}

	/**
	 * set the current kit.
	 */
	@command("kit")
	async kit() {
		logger.debug("simplecmake.kit command called");
		vscode.window.showQuickPick(kits.getKits()).then((value) => {
			utils.settings.set("kit", value);
		});
	}

	/**
	 * Set the current build configuration.
	 */
	@command("configuration")
	async configuration() {
		logger.debug("simplecmake.configuration command called");
		vscode.window.showQuickPick(cmake.getConfigurations()).then((value) => {
			utils.settings.set("configuration", value);
		});
	}

	/**
	 * Set the active target.
	 */
	@command("target")
	async target() {
		logger.debug("simplecmake.target command called");
		vscode.window.showQuickPick(cmake.getTargets()).then((value) => {
			utils.settings.set("target", value);
		});
	}

}
