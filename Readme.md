# Introduction

Simple [CMake](https://www.cmake.org) support in [Visual Studio Code](https://code.visualstudio.com)

This project was born from 2 things: I wanted to learn how to develop Visual Studio Code
addons, I was a bit frustrated with [CMake Tools](https://github.com/vector-of-bool/vscode-cmake-tools)
It's a really great tool, but there are a lot of small things that do not work well with it.
At first I tried to contribute, but the code is old, not documented, and it tries to do too many things
(it supports Emscripten for instance...)

So this addon is meant as a bare minimum CMake integration into Visual Studio Code and a learning
project for me.

### Disclaimer

This project is hihgly experimental. At the moment it doesn't even configure/build a CMake project.
This readme will be updated as I go along, and the [changelog](Changelog.md) will contain the history.

# Supported Commands

None

# Development

## Prerequisite

- [CMake](https://www.cmake.org)
- [Visual Studio Code](https://code.visualstudio.com)
- [Node.js](https://nodejs.org)

## Setup

- clone `git clone https://github.com/dcourtois/vscode-simplecmake.git`
- open `vscode-simplecmake` folder in Visual Studio Code
- in the terminal, enter `npm install .` to install everything needed locally

## Code convention

- Use `tabs` and set their width as 4 spaces in your edior. I don't care what you prefer, 4 spaces instead of 1 tab is a waste of disk space.
- Comment your code. And before you object: no, your code is not self-explanatory.
- Use types wherever you can (in function signatures, etc.) for better "compile-time" checks.
- Favor `const` over `let`, and *never* use `var`.
- Always use `===` when checking equality.
- Classes use CamelCase
- Namespaces, variables and function names use camelCase with a leading lower case.
- Strings in double quotes `"` (I know in Javascript land it's usually single quotes, but I come from C++ land where we use double ones, so bare with me :p)
- For the rest, take a bit of time reading the existing code in `src` and stick to the style there.

Code convention will *never* please everyone but they are necessary. So:

- Don't bother trying to convince me to change them unless you have a really good point
- Respect them if you want me to consider pull requests :)
