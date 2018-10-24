"use strict";


import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import * as child_process from "child_process";

import * as logger from "./logger";


/**
 * Extension context.
 */
let _context: vscode.ExtensionContext;

/**
 * Initialize the module. Call once only.
 */
export function initialize(context: vscode.ExtensionContext) {
	console.assert(_context === undefined, "utils already initialized");
	_context = context;
}

/**
 * Contains everything returned after the execution of a child process.
 */
export class Result {
	//! the exit code of the child process
	public code: number = -1;

	//! the signal by which the process was stopped
	public signal: string = null;

	//! what it outputed to the standard output
	public stdout: string = "";

	//! what it outputed to the standard error
	public stderr: string = "";

	//! the error string. For instance if the path to the file
	//! to execute was incorrect, etc.
	public error: string = "";
}

/**
 * Asynchronously execute a program.
 *
 * @param program
 * 	Name of the program, or absolute path to it.
 *
 * @param args
 * 	Optional list of arguments to pass to the program.
 *
 * @param options
 * 	Optional options to call the program with. See documentation of
 * 	Node's child_process module. On top of those options, the following
 * 	ones are supported:
 *
 * 		- logCommand: if true, log the command line
 * 		- onStarted: function called if the process was correctly started.
 * 					 It receives the child process id as a parameter.
 * 		- onStdout: function called if the process writes to stdout
 * 		- onStderr: function called if the process writes to stderr
 * 		- onError: function called if the process returns errors
 * 		- onAll: function that will be used in place of any of the previous
 * 				 ones if they are omitted.
 *
 * @returns
 * 	Promise< Result >
 */
export async function execute(program: string, args?: string[], options?: {}): Promise< Result > {
	return new Promise< Result >((resolve) => {
		// data
		let result = new Result();

		// default parameters
		args = args || [];
		options = options || {};

		// merge env vars of the current process, or set them
		if (options["env"] !== undefined) {
			options["env"] = Object.assign(options["env"], process.env);
		} else {
			options["env"] = process.env;
		}

		// log if needed
		if (options["logCommand"] === true) {
			logger.log(program, args.join(" "));
		}

		// spawn our process (might throw)
		try {

			// create and call the started callback
			const p = child_process.spawn(program, args, options);
			call(options, "onStarted", p.pid);

			// watch for standard outputs
			const onData = (out, callback) => {
				return (data) => {
					const string = data.toString();
					result[out] += string;
					call(options, callback, string);
					call(options, "onAll", string);
				};
			};
			p.stdout.on("data", onData("stdout", "onStdout"));
			p.stderr.on("data", onData("stderr", "onStderr"));

			// on errors, just store the name and message, close will be called next
			p.on("error", (error) => { result.error = `${error.name} - ${error.message}`; });

			// on close and exit, resolve
			const onStop = (code, signal) => {
				result.code = code;
				result.signal = signal;
				resolve(result);
			};
			p.on("close", onStop);
			p.on("exit", onStop);

		} catch (error) {

			// get the error, and resolve
			result.code = error.code;
			result.error = error.message;
			resolve(result);

		}
	});
}

/**
 * Helper function used to conditionnally call a method in an object.
 */
export function call(object: {}, key: string, ...args): any {
	if (object.hasOwnProperty(key) === true) {
		const func = object[key];
		if (typeof func === "function") {
			return func(args);
		}
	}
	return undefined;
}

/**
 * Utility function used to set a value in a JSON object. The URL is a string
 * with dot separators. For each token of the url, the required subobject is
 * created if necessary.
 *
 * Example use:
 *
 * ```
 * const obj = { };
 * utils.setProperty(obj, "foo.bar", "baz");
 * console.log(obj["foo"]["bar"]);
 * ```
 *
 * @param root
 * 	The root JSON object
 *
 * @param url
 * 	The property URL
 *
 * @param value
 * 	The vaue of the property
 */
export function setProperty(root: object, url: string, value: any) {
	url.split(".").forEach((token, index, array) => {
		if (index < array.length - 1) {
			if (root.hasOwnProperty(token) === false) {
				root[token] = {};
			}
			root = root[token];
		} else {
			root[token] = value;
		}
	});
}

/**
 * Get values from the configuration (settings) file. This handles the
 * following variable substitution when the type is a string:
 *
 * - ${workspaceFolder} : current workspace directory
 *
 * @param category
 * 	The setting category
 *
 * @param key
 * 	The setting name
 *
 * @param def
 * 	An optional default value which is returned in case the setting
 * 	could not be retrieved.
 *
 * @return
 * 	The setting's value if it was found, def if not and def was specified,
 * 	otherwise null.
 */
export function getConfig(category: string, key: string, def?: any, substitutions?: object): any | null {
	// get the configuration section
	const configuration = vscode.workspace.getConfiguration(category);
	if (configuration === null) {
		return def || null;
	}

	// get the value
	let value = configuration.get(key) || def || null;

	// if the value is a string, replace variables
	if (typeof value === "string") {
		// builtin substitutions
		value = value.replace(/\${workspaceFolder}/g, vscode.workspace.rootPath);

		// optional ones
		if (substitutions !== undefined) {
			for (const variable in substitutions) {
				value = value.replace(new RegExp(`\\\${${variable}}`, "g"), substitutions[variable]);
			}
		}
	}

	return value;
}

/**
 * Register a configuration (setting) change listener. The listener will automatically be added
 * to the disposables.
 */
export function onConfigChange(callback: (event: vscode.ConfigurationChangeEvent) => any) {
	addDisposable(vscode.workspace.onDidChangeConfiguration(callback));
}

/**
 * This function will add the disposable to the current extension context's
 * subscriptions, so that the disposable is automatically disposed of when
 * needed.
 *
 * @param disposable
 * 	An object implementing vscode.Disposable
 *
 * @returns
 * 	disposable
 */
export function addDisposable(disposable: any): any {
	console.assert(_context !== undefined, "utils needs to be initialized");
	console.assert(typeof disposable.dispose === "function", "disposable needs to implement vscode.Disposable");
	_context.subscriptions.push(disposable);
	return disposable;
}

/**
 * Copy a file.
 *
 * @param source
 * 	Source filename
 *
 * @param destination
 * 	Destination path. If the destination already exists and is a directory,
 * 	the source file will be copied in the directory, preserving its name.
 * 	Otherwise the file is copied using destination as its new name.
 */
export function copyFile(source: string, destination: string) {
	if (fs.existsSync(destination) === true && fs.statSync(destination).isDirectory() === true) {
		fs.writeFileSync(path.join(destination, path.basename(source)), fs.readFileSync(source));
	} else {
		fs.writeFileSync(destination, fs.readFileSync(source));
	}
}

/**
 * Normalize path, always using / as separator.
 * Also make drive letters upper case on Windows.
 */
export function normalizePath(...tokens: string[]): string {
	// assemble the path
	let pathStr = path.join(...tokens);

	// use the official normalize to remove any . and .. parts
	pathStr = path.normalize(pathStr);

	// convert everything to /
	pathStr = pathStr.replace(/\\/g, "/");

	// convert drive letters to upper cases
	pathStr = pathStr.replace(/^([a-z]):/, (token) => { return token.toUpperCase(); });

	// done
	return pathStr;
}

/**
 * This namespace provides functionalities to easily work with persistent workspace values.
 *
 * It allows to register new settings that will be persisted from session to session, and
 * also provides an event system to be notified when a setting changes.
 */
export namespace settings {

	/**
	 * Stores a setting data
	 */
	class Setting {

		//! the value of the setting
		public value: any = undefined;

		//! the event used to notify when the value changed
		public event: vscode.EventEmitter< string | null > = new vscode.EventEmitter< string | null >();

	};

	/**
	 * Register a new setting.
	 *
	 * @param name
	 * 	Name of the setting. It will be available in the workspace state as `simplecmake.<name>`
	 *
	 * @return
	 * 	the value of the setting if it's already registered, undefined if it didn't exist.
	 */
	export function register(name: string) {
		// assert if the setting is already registered
		console.assert(registered.hasOwnProperty(name) === false, `setting ${name} already registered`);

		// register
		const setting = new Setting();
		setting.value = _context.workspaceState.get(`simplecmake.${name}`);
		registered[name] = setting;

		// return its value
		return setting.value;
	}

	/**
	 * The registered settings
	 */
	const registered = {};

	/**
	 * Get a setting value
	 *
	 * @param name
	 * 	Name of the setting. The function asserts if it's not registered.
	 *
	 * @returns
	 * 	The value of the setting.
	 */
	export function get(name: string) {
		console.assert(registered.hasOwnProperty(name) === true, "unknown setting");
		return registered[name].value;
	}

	/**
	 * Set a setting value. If the value is different than the current one,
	 * the new value is stored in the workspace states, and the corresponding event
	 * is fired.
	 *
	 * @param name
	 * 	Name of the setting. The function asserts if it's not registered.
	 *
	 * @param value
	 * 	The new value of the setting.
	 */
	export function set(name: string, value) {
		console.assert(registered.hasOwnProperty(name) === true, "unknown setting");
		const setting = registered[name];
		if (setting.value !== value) {
			setting.value = value;
			_context.workspaceState.update(`simplecmake.${name}`, value);
			setting.event.fire(value);
		}
	}

	/**
	 * Register a new watcher on a setting change.
	 *
	 * @param name
	 * 	Name of the setting. The function asserts if it's not registered.
	 *
	 * @param callback
	 * 	Function which will be called when the setting changes. This callback
	 * 	will receive the new value of the setting. It will also be called once
	 * 	when this function is called.
	 */
	export function on(name: string, callback: (value) => void) {
		console.assert(registered.hasOwnProperty(name) === true, "unknown setting");

		// register the listener
		const setting = registered[name];
		setting.event.event(callback);

		// send the value to the callback once
		callback(setting.value);
	}

}

/**
 * Recursively empty a directory, then remove it
 */
export function rmdirSync(dir: string) {
	if (fs.existsSync(dir) === true) {
		fs.readdirSync(dir).forEach((value) => {
			const filename = normalizePath(dir, value);
			if (fs.lstatSync(filename).isDirectory() === true) {
				rmdirSync(filename);
			} else {
				fs.unlinkSync(filename);
			}
		});
		fs.rmdirSync(dir);
	}
}
