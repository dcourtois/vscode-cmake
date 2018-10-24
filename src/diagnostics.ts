"use strict";


import * as vscode from "vscode";
import * as logger from "./logger";
import * as utils from "./utils";


/**
 * The collection of diagnostics
 */
let _collection: vscode.DiagnosticCollection;

/**
 * Temporary collection of diagnostics.
 *
 * @note
 * 	This is needed because vscode.DiagnosticCollection doesn't support dynamic
 * 	addition of diagnostics.
 */
let _diagnostics: object = {};

/**
 * Diagnostic parsers.
 */
const parsers = [
	// gcc / Linux
	{
		"regexp": /(?:ERROR: )?([^:]+):(\d+):(\d+): (warning|error|fatal error): ([^\n]+)/,
		"map": {
			"file": 1,
			"line": 2,
			"column": 3,
			"type": 4,
			"message": 5
		}
	},

	// msvc
	{
		"regexp": /([^\(]+)\((\d+)\): (warning|error)[^:]*: ([^\n]+)/,
		"map": {
			"file": 1,
			"line": 2,
			"type": 3,
			"message": 4
		}
	}
];

/**
 * Initialization method
 */
export function initialize() {
	console.assert(_collection === undefined, "diagnostics module already initialized");
	_collection = utils.addDisposable(vscode.languages.createDiagnosticCollection("CMake"));
}

/**
 * Parses a message and try to get a diagnostic from it.
 *
 * @param message
 * 	The message
 */
export function parse(message: string) {
	// log everything
	logger.log(message);

	// parse the message line by line
	for (const line of message.split("\n")) {
		for (const parser of parsers) {
			const result = parser.regexp.exec(line);
			if (result !== null) {
				add(
					result[parser.map.file],
					parseInt(result[parser.map.line]) - 1,
					parser.map.hasOwnProperty("column") === true ? parseInt(result[parser.map["column"]]) - 1 : 0,
					severity(result[parser.map.type]),
					result[parser.map.message]
				);
				break;
			}
		}
	}
}

/**
 * Clear the diagnostic list
 */
export function clear() {
	_collection.clear();
	_diagnostics = {};
}

/**
 * Add a new diagnostic
 */
export function add(file: string, line: number, column: number, severity: vscode.DiagnosticSeverity, message: string) {
	// create our diagnostic
	const diagnostic = new vscode.Diagnostic(
		new vscode.Range(line, column, line, Number.POSITIVE_INFINITY),
		message,
		severity
	);
	diagnostic.source = "CMake";

	// ensure we have a list for this file
	if (_diagnostics.hasOwnProperty(file) === false) {
		_diagnostics[file] = [];
	}

	// add it
	_diagnostics[file].push(diagnostic);
}

/**
 * Finalize the diagnostics.
 */
export function finalize() {
	// set the diagnostics collections
	let diags = 0;
	for (const file in _diagnostics) {
		diags += _diagnostics[file].length;
		_collection.set(vscode.Uri.file(file), _diagnostics[file]);
	}

	// if we have some diagnostics, show the problems
	// note: this command is a toggle, meaning if the problems is currently shown
	// and have the focus, it will be close. But since the CMake actions are logged,
	// the output usually have the focus, so it's ok.
	if (diags > 0) {
		vscode.commands.executeCommand("workbench.actions.view.problems");
	}
}

/**
 * Utility function to convert a message type to vscode.DiagnosticSeverity.
 *
 * @param type
 * 	The type of severity. Supported types are "warning", "error" and "fatal error".
 * 	The check is case insensitive.
 *
 * @see parsers
 */
function severity(type: string): vscode.DiagnosticSeverity {
	const supported = {
		"warning": vscode.DiagnosticSeverity.Warning,
		"error": vscode.DiagnosticSeverity.Error,
		"fatal error": vscode.DiagnosticSeverity.Error
	}
	if (supported.hasOwnProperty(type.toLowerCase()) === true) {
		return supported[type];
	}
	return vscode.DiagnosticSeverity.Hint;
}
