"use strict";


/**
 * @module cmake
 *
 * This module hides all the headaches related to dealing with CMake, and just exposes
 * a few functions to configure, build, etc. CMake projects.
 *
 * It also exposes an `initialize` method which needs to be called once when the addon is
 * loaded.
 *
 * Those functions are exposed to vscode through the commands module.
 */


import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import * as diagnostics from "./diagnostics";
import * as logger from "./logger";
import * as utils from "./utils";
import * as generators from "./generators";
import * as kits from "./kits";

/**
 * List of config (settings) which need to trigger various CMake actions.
 * This list is used in `initialize` to automatically update the cmake module
 * when needed.
 */
const _configChanges: { [key: string]: Function } = {

	// executable change, stop the server
	"executable": () => {
		if (isRunning() === true) {
			logger.log("Stopping CMake server...");
			stop();
		}
	},

	// build directory, nuke the previous folder, stop the server
	"buildDirectory": () => {
		nuke();
		if (isRunning() === true) {
			logger.log("Stopping CMake server...");
			stop();
		}
	},

	// generator, delete the cache, stop the server
	"generator": () => {
		const cacheFile = getCacheFile();
		if (fs.existsSync(cacheFile) === true) {
			logger.log("Deleting CMake cache...");
			fs.unlinkSync(getCacheFile());
		}

		if (isRunning() === true) {
			logger.log("Stopping CMake server...");
			stop();
		}
	},

	// kit, stop the server
	"kit": () => {
		if (isRunning() === true) {
			logger.log("Stopping CMake server...");
			stop();
		}
	},

	// configure arguments, configure
	"configureArguments": () => {
		_configured = false;
	},

	// install directory, configure
	"configure":() => {
		_configured = false;
	}

};

/**
 * Initialize the module. Call only once
 *
 * @param context
 * 	The current extension context.
 */
export async function initialize(context: vscode.ExtensionContext) {
	// error check and store the context
	console.assert(_context === undefined, "utils already initialized");
	_context = context;

	// register our persistent settings
	utils.settings.register("configuration");
	utils.settings.register("target");

	// ensure we won't let a CMake server running
	utils.addDisposable(new Cleanup());

	// start listening to settings changes
	utils.onConfigChange((event: vscode.ConfigurationChangeEvent) => {
		// ignore unrelated changes
		if (event.affectsConfiguration("simplecmake") === false) {
			return;
		}

		// check config names
		for (const config in _configChanges) {
			if (event.affectsConfiguration(`simplecmake.${config}`) === true) {
				logger.log(`Configuratin change on simplecmake.${config}`);
				_configChanges[config]();
				return;
			}
		}
	});

	// start CMake server
	start();
}

/**
 * The extension context
 */
let _context: vscode.ExtensionContext;

/**
 * The pipe used to communicate with CMake server.
 */
let _cmakePipe: net.Socket | null = null;

/**
 * ID of the CMake server process
 */
let _cmakePid: number = -1;

/**
 * true when the handshake has been correctly done, false otherwise
 */
let _handshake: boolean = false;

/**
 * true when configured
 */
let _configured: boolean = false;

/**
 * base cookie name
 */
const _baseCookie: string = `simple-cmake-${process.pid}`;

/**
 * optional post-configure function
 */
let _postConfiguration: Function | null = null;

/**
 * optional post-handshake function
 */
let _postHandshake: Function | null = null;

/**
 * Stop the CMake server and communication pipe.
 */
function stop() {
	// kill the CMake process if it's still running
	// note: reset _cmakePid to avoid re-creating the communication pipe
	if (_cmakePid !== -1) {
		const pid = _cmakePid;
		_cmakePid = -1;
		process.kill(pid);
	}

	// close the pipe if still up
	if (_cmakePipe !== null) {
		_cmakePipe.end();
		_cmakePipe = null;
	}
}

/**
 * Little cleanup utility that is registered upon startup used to kill the
 * CMake server process when the extension is disabled.
 */
class Cleanup implements vscode.Disposable {

	/**
	 * implements vscode.Dispoable.dispose
	 * This will kill the CMake process if it's running, and will release
	 * its communication pipe.
	 */
	public dispose = stop;

}

/**
 * Receive a CMake server message. This is where all the logic of communicating with
 * CMake goes.
 *
 * @param message
 * 	The message sent by the server
 */
function receiveMessage(message) {

	// error checks
	if (message.type === undefined) {
		logger.log("server - invalid message layout. Missing type");
		return;
	}

	// handle messages types
	switch (message.type) {

		// message
		case "message":
			logger.log(message.message);
			break;

		// error
		case "error":
			logger.log(`error: ${message.inReplyTo} - ${message.errorMessage}`);
			break;

		// signal
		case "signal":

			// check the name
			switch (message.name) {

				// build system is dirty
				case "dirty":
					_configured = false;
					break;

				// silent
				case "fileChange":
					break;

				// not handled
				default:
					logger.log("server signal -", JSON.stringify(message));
					break;

			}

			break;

		// startup message, ensure we have at least 1.x protocol version supported
		case "hello":
			// check the protocols
			let supported = false;
			for (const protocolVersion of message.supportedProtocolVersions) {
				if (protocolVersion.major === 1) {
					supported = true;
					break;
				}
			}

			// error check
			if (supported === false) {
				logger.log("server - protocol version 1.x not supported. Please update your CMake to a more recent version.");
				break;
			}

			// initiate handshake
			sendMessage({
				"type": "handshake",
				"sourceDirectory": getSourceDirectory(),
				"buildDirectory": getBuildDirectory(),
				"generator": utils.getConfig("simplecmake", "generator", "Ninja")
			});

			break;

		// reply
		case "reply":

			// check cookie
			if (message.cookie !== _baseCookie) {
				return;
			}

			// handle the reply
			switch (message.inReplyTo) {

				// initial handshake reply
				case "handshake":
					_handshake = true;

					// callback if needed
					if (_postHandshake !== null) {
						_postHandshake();
						_postHandshake = null;
					}

					// follow up with a globalSettings to retreive the list of generators
					sendMessage({ "type": "globalSettings" });

					break;

				// global settings
				case "globalSettings":
					generators.initialize(message["capabilities"]["generators"]);
					break;

				// configure done
				case "configure":
					logger.log("Configuring done");

					// generate build system files
					logger.log("Generating...")
					sendMessage({ "type": "compute" });
					break;

				// compute done
				case "compute":
					_configured = true;

					// optional 1 time post-configure callback
					if (_postConfiguration !== null) {
						_postConfiguration();
						_postConfiguration = null;
					}

					break;

				// code model
				case "codemodel":
					break;

				// unhandled
				default:
					logger.log("server reply -", JSON.stringify(message));
					break;

			}

			break;

		// progress types
		case "progress":
			break;

		default:
			logger.log("server message -", JSON.stringify(message));
			break;
	}
}

/**
 * Send a message to CMake server
 *
 * @param message
 * 	The JSON message to send to the server
 */
function sendMessage(message) {
	console.assert(_cmakePipe !== null);

	// add common stuff
	message["protocolVersion"] = { "major": 1 };
	message["cookie"] = _baseCookie;

	// send the message
	_cmakePipe.write('\n[== "CMake Server" ==[\n');
	_cmakePipe.write(JSON.stringify(message));
	_cmakePipe.write('\n]== "CMake Server" ==]\n');
}

/**
 * Start the CMake server
 */
async function start(callback?: Function) {
	// ensure we don't already have a CMake instance running
	console.assert(_cmakePid === -1);
	console.assert(_cmakePipe === null);

	// before starting, check CMake version
	utils.execute(getExecutable(), [ "--version" ], { "logCommand": true }).then(

		// ok, found CMake
		(result) => {

			// launch CMake server function
			const launch = () => {

				// generate a named pipe
				const pipeName = os.platform() === "win32" ?
					path.join("\\\\?\\pipe", `cmake.server.pipe.${process.pid}`) :
					path.join(os.tmpdir(), `cmake.server.pipe.${process.pid}`);

				// start CMake server
				utils.execute(
					getExecutable(),
					[
						"-E",
						"server",
						"--experimental",
						`--pipe=${pipeName}`
					],
					{
						"logCommand": true,
						"onStarted": (pid) => {

							// CMake server successfully created, keep the PID, and log
							_cmakePid = pid;
							logger.log(`server started with pid ${pid} using named pipe ${pipeName}`);

							// if a callback was provided, install it
							if (callback !== undefined) {
								_postHandshake = callback;
							}

							// CMake takes a bit of time before creating its communication pipe, so we
							// need to connect, check for errors, and try again a bit later until it's ok
							const connect = () => {
								// create the connection
								_cmakePipe = net.createConnection(pipeName);

								// watch for error and retry
								_cmakePipe.on("error", () => {
									if (_cmakePid !== -1) {
										setTimeout(connect, 10);
									}
								});

								// connect the data event
								_cmakePipe.on("data", (buffer) => {
									// get as string
									let data = buffer.toString();

									// ensure the data is valid
									if (data.startsWith('\n[== "CMake Server" ==[\n') === false ||
										data.endsWith('\n]== "CMake Server" ==]\n') === false) {
										logger.log(`CMake server - invalid data ${data}`);
										return;
									}

									// process
									receiveMessage(JSON.parse(data.slice(24, -24)));
								});
							};

							// create the connection
							connect();

						}
					}
				).then(() => {

					// the server was stopped
					logger.log("CMake server stopped");

					// in case it was stopped externally, reset the ID
					_cmakePid = -1;
					stop();

				});

			}

			// check the version
			const version = result.stdout.match(/cmake version (\d+)\.(\d+)\.(\d+)/);
			if (version === null) {

				// the version couldn't be extracted. Let the user decide if he
				// wants to still try it or not.
				vscode.window.showWarningMessage(
					"CMake was found, but the version couldn't be checked. Continue anyway ?",
					"yes", "no"
				).then((result) => {
					if (result === "yes") {
						launch();
					}
				});

			} else {

				// check the version
				if (parseInt(version[1]) < 3 || parseInt(version[2]) < 12) {
					logger.log("insufficient version of CMake. Please update to at least 3.10");
					logger.log("you can also edit 'simplecmake.executable' in your settings to make it point to a more recent version");
					return;
				} else {
					logger.log(`${version[0]} found`);
				}

				// ok, correct version, launch
				launch();
			}

		}, () => {

			// we couldn't start CMake, it's not available in the path
			logger.log("couldn't start CMake. Possible fixes:");
			logger.log("  - install it and make it available to the global PATH env var.");
			logger.log("  - configure 'simplecmake.executable' to point to a valid CMake executable.");
			logger.log("when done, restart Visual Studio Code");
			stop();

		}
	);

}

/**
 * Check if the CMake server is running and the communication pipe valid
 */
function isRunning(): boolean {
	return _cmakePid !== -1 && _cmakePipe !== null;
}

/**
 * Get the CMake executable
 */
function getExecutable(): string {
	return utils.getConfig("simplecmake", "executable", "cmake");
}

/**
 * Get the source directory
 */
function getSourceDirectory(): string {
	return utils.normalizePath(vscode.workspace.rootPath);
}

/**
 * Get the build directory
 */
function getBuildDirectory(): string {
	return utils.normalizePath(utils.getConfig("simplecmake", "buildDirectory", path.join(vscode.workspace.rootPath, "build")));
}

/**
 * Get the number of parallel jobs to use for building
 */
function getParallelJobs(): number {
	return utils.getConfig("simplecmake", "parallelJobs", os.cpus().length);
}

/**
 * Get the current generator
 */
function getGenerator(): generators.Generator | undefined {
	return generators.getGenerator(utils.getConfig("simplecmake", "generator", "Ninja"));
}

/**
 * Get the current kit
 */
function getKit(): kits.Kit | undefined {
	return kits.getKit(utils.settings.get("kit"));
}

/**
 * Get the current configuration
 */
function getConfiguration(): string {
	return utils.settings.get("configuration");
}

/**
 * Get the current target
 */
function getTarget(): string {
	return utils.settings.get("target");
}

/**
 * Get the CMake cache filename
 */
function getCacheFile(): string {
	return utils.normalizePath(getBuildDirectory(), "CMakeCache.txt");
}

/**
 * Asynchronously configure.
 */
export async function configure(cleanCache: boolean = false) {

	// configure function
	const doConfigure = () => {

		// get the current kit
		const kit = getKit();
		if (kit === undefined) {
			logger.log("Not kit selected");
			return;
		}

		// clean the cache file if needed
		if (cleanCache === true) {
			const cacheFile = getCacheFile();
			if (fs.existsSync(cacheFile) === true) {
				logger.log(`Deleting cache file ${cacheFile}...`);
				fs.unlinkSync(cacheFile);
				logger.log("Done");
			}
		}

		logger.log("Configuring...")
		sendMessage({
			"type": "configure",
			"cacheArguments": [
				`-DCMAKE_BUILD_TYPE=${getConfiguration()}`,
				`-DCMAKE_C_COMPILER:FILEPATH=${kit.compiler}`,
				`-DCMAKE_CXX_COMPILER:FILEPATH=${kit.compiler}`,
				`-DCMAKE_LINKER:FILEPATH=${kit.linker}`
			]
		});

	}

	// start the server or configure directly
	if (isRunning() === false) {
		start(doConfigure);
	} else {
		doConfigure();
	}

}

/**
 * Asynchronously build.
 */
export async function build() {
	if (isRunning() === false) {
		return;
	}

	const launchBuild = () => {
		logger.log("building...")

		// common arguments
		let args = [
			"--build",		getBuildDirectory(),
			"--parallel",	getParallelJobs().toString()
		];

		// optional target
		const target = getTarget();
		if (target !== undefined) {
			args.push("--target", target);
		}

		// per-kit configurations
		const generator = getGenerator();
		if (generator !== undefined) {
			args.push("--");
			args = args.concat(generator.options);
		}

		// execution options
		const options = {
			"logCommand": true,
			"onStdout" : (message) => { logger.log(message); }
		}

		// launch CMake
		utils.execute(getExecutable(), args, options);
	};

	if (_configured == false) {
		_postConfiguration = launchBuild;
		configure();
	} else {
		launchBuild();
	}

}

/**
 * Nuke the build folder
 */
export function nuke() {
	const buildDir = getBuildDirectory();
	logger.log(`Deleting build dir ${buildDir}...`);
	utils.rmdirSync(buildDir);
	logger.log("Done");
}

/**
 * Asynchronously clean.
 */
export async function clean() {
	if (isRunning() === false) {
		return;
	}

	const launchClean = () => {
		logger.log("cleaning...")
		const args = [
			"--build",	getBuildDirectory(),
			"--target",	"clean"
		];
		const options = {
			"logCommand": true,
			"onStdout" : (message) => { logger.log(message); }
		}
		utils.execute(getExecutable(), args, options);
	};

	if (_configured == false) {
		_postConfiguration = launchClean;
		configure();
	} else {
		launchClean();
	}
}

/**
 * Asynchronously install.
 */
export async function install() {
	if (isRunning() === false) {
		return;
	}

	diagnostics.clear();
	logger.clear();
}

/**
 * Get a list of targets. This will only return "all" until the project is configured.
 */
export async function getTargets() {
	return ["all"];
}

/**
 * Get a list of configurations (build type)
 */
export async function getConfigurations() {
	return utils.getConfig(
		"cmake",
		"configurations",
		[
			"Debug",
			"Release",
			"RelWithDebInfo",
			"MinSizeRel"
		]
	);
}
