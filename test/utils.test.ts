"use strict";

import * as assert from "assert";
import * as vscode from "vscode";
import * as utils from "../src/utils";

/**
 * Test the utils.ts module
 */
suite("utils", () => {

	test("execute", async () => {

		assert.equal((await utils.execute("echo", [ "foo" ], { "shell": true })).stdout.trim(), "foo");
		assert.equal((await utils.execute("i_do_not_exists")).stdout, "");

	});

	test("call", () => {

		const obj = {
			"test": (value) =>{ return `hello ${value}` }
		};

		assert.equal(utils.call(obj, "test", "world"), "hello world");
		assert.equal(utils.call(obj, "foo", "world"), undefined);

	});

	test("setProperty", () => {

		const root = {};
		utils.setProperty(root, "bar",			"foo");
		utils.setProperty(root, "foo.bar",		"baz");
		utils.setProperty(root, "hello.world",	"!");

		assert.equal(root["bar"],				"foo");
		assert.equal(root["foo"]["bar"],		"baz");
		assert.equal(root["hello"]["world"],	"!");

	});

	test("getConfig", () => {

		const config = vscode.workspace.getConfiguration("simplecmake");

		config.update("executable", "world");
		assert.equal(utils.getConfig("simplecmake", "executable", "hell"), "world");
		assert.equal(utils.getConfig("simplecmake", "foo", "hell"), "hell");

		config.update("executable", "${workspaceFolder}");
		assert.equal(utils.getConfig("simplecmake", "bar", "nothing"), vscode.workspace.rootPath);

	});

});
