# CircuitPython Sync for Visual Studio Code

## Overview
This extension provides developers using Adafruit's CircuitPython (CP) on microcontrollers with tools for efficient CP coding, uploading, and monitoring during development.  The model used by this extension is that code and library files reside on the storage of the development workstation with tools for synchronizing application assets (python code, libraries, support files) with the attached board. This model is primarily intended to keep development assets in source control while ensuring the microcontroller storage is kept in sync.

Inspired by [wmerkins CircuitPython V2](https://marketplace.visualstudio.com/items?itemName=wmerkens.vscode-circuitpython-v2) extension, with a hat-tip to [Scott Hanselman's blog post](https://www.hanselman.com/blog/using-visual-studio-code-to-program-circuit-python-with-an-adafruit-neotrellis-m4).

A full help file is available with the `Welcome and Help` command in the Command Palette (Ctrl+Shift+P) after installing the extension and opening a workspace.

## Getting Started
The extension activates when a workspace containing a CircuitPython code file (code.py or main.py) or a `lib` folder is opened.  You can also start the extension by running any command in the Command Palette. When the extension is activated the main toolbar will show in the lower activity bar:

![Toolbar](https://raw.githubusercontent.com/padgettholdings/circuitpythonsync/refs/heads/master/resources/cpstoolbarsmall.png)

Using these buttons you can perform most of your workflow with a connected CircuitPython board.  From left to right:
* Copy code and support files to the board
* Copy libraries to the board
* Select the CircuitPython drive path for copy actions
* Select the CircuitPython board model for code editing support including IntelliSense, pin definitions, etc.

The extension can download library and board definitions (either the latest or a specified version), saving the configuration such that at any time your source control repo can be downloaded to restore your last saved development configuration.  The definitions support full Python IntelliSense and code completion, including pin definitions for the selected board. 

## Features
* **Board Explorer** - Shows current files on the board.  Compare of local and board files.  Download files from the board to workspace.  Delete files on the board.
* **Python Language Support** - VS Code Pylance augmented by library and board "stub" definitions for error checking, code completion, and IntelliSense. 
* **Configurable File and Copy Actions** - Manifest file saved in configuration to tailor which files and libraries are copied to the board.
* **Project Templates** - Create new projects from templates.  A default is provided but you can create your own to suit your needs.
* **Adafruit Project Bundle Support** - Quick access to Adafruit project bundles in the learn system.
* **Serial Monitor Compatibility** - Compatible with the built-in serial monitor in VS Code. 

