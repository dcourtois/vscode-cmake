"use strict";

import * as vscode from "vscode";

import * as utils from "./utils";


/**
 * The normal output channel.
 */
let _outputChannel: vscode.OutputChannel;

/**
 * The devlopment output channel.
 */
let _devOutputChannel: vscode.OutputChannel;

/**
 * Call once before everything else at the extension's activation
 */
export function initialize() {
	console.assert(_outputChannel === undefined, "logger already initialized");

	// usual output
	_outputChannel = utils.addDisposable(vscode.window.createOutputChannel("CMake"));

	// output channel, only if the development flag is set in the settings
	if (utils.getConfig("simplecmake", "development", false) === true) {
		_devOutputChannel = utils.addDisposable(vscode.window.createOutputChannel("CMake - Dev"));
	}
}

/**
 * log
 */
export function log(...args: string[]) {
	logTo(_outputChannel, true, ...args);
	logTo(_devOutputChannel, false, ...args);
}

/**
 * debug
 */
export function debug(...args: string[]) {
	logTo(_devOutputChannel, false, ...args);
}

/**
 * Clear the content of the default output channel
 */
export function clear() {
	_outputChannel.clear();
}

/**
 * Log things to an output channel. Works like console.log.
 */
function logTo(channel: vscode.OutputChannel, show: boolean, ...args: string[]) {
	// error check
	if (channel === undefined) {
		return;
	}

	// format the message
	let message: string = "";
	for (const arg of args) {
		if (message.length > 0) {
			message += " ";
		}
		if (typeof arg === "object") {
			message += JSON.stringify(arg, null, "  ");
		} else {
			message += arg;
		}
	}

	// push the channel to the foreground if needed
	if (show === true) {
		channel.show(true);
	}

	// log
	if (message.endsWith("\n") === true) {
		channel.append(message);
	} else {
		channel.appendLine(message);
	}
}
