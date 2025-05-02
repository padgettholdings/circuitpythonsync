# Welcome to CircuitPython Sync

The purpose of this extension is to provide developers using Adafruit's CircuitPython (CP) on microcontrollers with tools for efficient CP coding, uploading, and monitoring during development.  The model used by this extension is for code and library files to reside on the storage of the development workstation with tools for synchronizing application assets with the attached board. This model is primarily intended to keep development assets in source control while ensuring the microcontroller storage is kept in sync. Having code assets on the workstation also allows VS Code to efficiently leverage python language services like auto-completion and intellisense in conjunction with CircuitPython language and library "stubs" managed by the extension. There are other excellent VS Code extensions and alternate IDEs that use a model having the workstation directly edit files on the CircuitPython drive should you prefer not to use the source-control-first methodology.

To return to this help file while using the extension run the `Welcome and Help` command, or click on one of the help icons in the title bar of many of the commands.

## Table of Contents ##
* [Getting Started](#getting-started)
* [Toolbar and Board Explorer](#toolbar-and-board-explorer)
* [CircuitPython Language Support](#circuitpython-language-support)
* [CP Drive Mapping](#cp-drive-mapping)
* [Library Support](#library-support)
* [Board Support](#board-support)
* [Libs Copy Support](#libs-copy-support)
* [Files Copy Support](#files-copy-support)
* [Project Template Support](#project-template-support)
* [Board Downloading](#board-downloading)
* [Project Bundle Support](#project-bundle-support)

## Getting Started

The extension activates when a workspace is opened containing `code.py` or `main.py` python files and/or a folder for libraries named `lib` or `Lib`.  You can also manually start the extension (for instance in a blank workspace or where you have just created a python file) by running any of the commands, including `Welcome and Help` to show this file or one of the startup helpers like [Project Templates](#project-template-support) or [Project Bundles](#project-bundle-support).

For a simple application, create a code file (typically `code.py`), connect your board to a usb port on your workstation, map the CircuitPython drive using the [CP Drive Mapping](#cp-drive-mapping) command, and use the `Copy Files` command to push the code file to the board.  Then you can monitor and debug the application on the board using the VS Code built-in Serial monitor, making modifications and re-pushing to the board.

For more complicated applications that use sensors and other hardware you can add libraries with the extension [Library Support](#library-support) for Adafruit libraries, or add other 3rd party libraries as needed.  Library files have a dedicated `Copy libs` command as well as offering intellisense through Adafruit published definition files downloaded by the extension (which also includes all the built-in modules in CircuitPython).  You can also select the type of connected board to leverage the extension [Board Support](#board-support) feature, giving auto-completion and validation of board definitions such as pins available, for example.  The remainder of this help file gives details on all the commands and features of the extension.

One of the key ways in which the extension "protects" the integrity of your project is through extensive use of the VS code settings system. The extension saves CP and library bundle versions in the VS Code workspace settings along with board model and mapping settings.  When the settings are committed to source control you can then pull the repo down to any workstation and your project will be in the same state as last time you pushed to your repo.  Also, the extension will manage in-workspace copies of library and CP bundles which can optionally be included in your repo push, making it even faster to restore your project and get back to coding.  

[Top](#welcome-to-circuitpython-sync)

## Toolbar and Board Explorer

There are several visual tools offered by the extension that support the development workflow.  The first is a toolbar consisting of 4 command/status buttons in the lower status bar of VS Code (usually toward the left side).  
The buttons show status through icons and also tooltips for issues and settings.

![CPS toolbar](cpstoolbarsmall.png)

From left to right the buttons are:
* **Copy Files to board.**  The icon to the right of the arrow shows whether a valid board connection exists, augmented by a tool tip explaining the condition.  The button will also "light up" with a contrasting color when files are ready to be copied, such as after editing.  Clicking the button copies the files to the board if connected.  The files that are copied are either the default `code.py` or `main.py`, or a configured set using the command detailed below in [Files Copy Support](#files-copy-support).
* **Copy Libraries to board.** Similar to the Files Copy, status is indicated by icons and a tooltip.  The button lights up if new libraries are added or libraries are removed.  Clicking the button copies either all the libraries under the Lib folder or those configured using the command detailed in [Libs Copy Support](#libs-copy-support).
* **Map CP Drive.** Clicking this runs the command detailed in [CP Drive Mapping](#cp-drive-mapping).  The tooltip on the button shows the current mapping, if any.
* **Select CP Board Type.**  Clicking this button brings up a list for choosing one CircuitPython qualified board model to support intellisense and validation during code development.  More details can be found below at [Board Support](#board-support).  The tooltip on the button shows the currently chosen board type.

A companion tool called the Board Explorer shows a tree view of the contents of the CircuitPython drive if connected.  By default the tool shows up in the Primary sidebar explorer views (usually on the left side).

![CPS Board Explorer Primary](boardexplorerleft.png)

Note that there are some action buttons that only show up when you float your mouse over the `BOARD EXPLORER` title.  However, the explorer is generally more useful if you open the secondary sidebar and drag the explorer to one of the tabs; the action buttons show up without needing to mouse over.

![CPS Board Explorer Secondary](boardexplorerright.png)

In addition to showing the files and folders on the mapped board, the explorer enables file deletion (right click on a file), opening the drive in the operating system (file explorer on Windows, Finder on MacOS, terminal on Linux), and the view refreshed when changes occur outside the extension.  The board files can also be downloaded to your workspace with various options as detailed in [Board Downloading](#board-downloading).

[Top](#welcome-to-circuitpython-sync)

## CircuitPython Language Support

help text 2

help text 2

help text 2

help text 2

help text 2

help text 2

help text 2

[Top](#welcome-to-circuitpython-sync)

## CP Drive Mapping

help text 8

help text 8

help text 8

help text 8

help text 8

help text 8

help text 8

help text 8

help text 8

[Top](#welcome-to-circuitpython-sync)

## Library Support

help text 3

help text 3

help text 3

help text 3

help text 3

help text 3

help text 3

help text 3

help text 3

[Top](#welcome-to-circuitpython-sync)

## Board Support

help text 4

help text 4

help text 4

help text 4

help text 4

help text 4

help text 4

help text 4

help text 4

[Top](#welcome-to-circuitpython-sync)

## Libs Copy Support

help text 5

help text 5

help text 5

help text 5

help text 5

help text 5

help text 5

help text 5

help text 5

[Top](#welcome-to-circuitpython-sync)

## Files Copy Support

help text 6

help text 6

help text 6

help text 6

help text 6

help text 6

help text 6

help text 6

help text 6

[Top](#welcome-to-circuitpython-sync)

## Project Template Support

help text 7

help text 7

help text 7

help text 7

help text 7

help text 7

help text 7

help text 7

help text 7

[Top](#welcome-to-circuitpython-sync)

## Board Downloading

help text 9

help text 9

help text 9

help text 9

help text 9

help text 9

help text 9

help text 9

help text 9

[Top](#welcome-to-circuitpython-sync)

## Project Bundle Support

help text 10

help text 10

help text 10

help text 10

help text 10

help text 10

help text 10

help text 10

help text 10

[Top](#welcome-to-circuitpython-sync)

