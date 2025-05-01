# Welcome to CircuitPython Sync

The purpose of this extension is to provide developers using Adafruit's CircuitPython (CP) on microcontrollers with tools for efficient CP coding, uploading, and monitoring during development.  The model used by this extension is for code and library files to reside on the storage of the development workstation with tools for synchronizing application assets with the attached board. This model is primarily intended to keep development assets in source control while ensuring the microcontroller storage is kept in sync. Having code assets on the workstation also allows VS Code to efficiently leverage python language services like auto-completion and intellisense in conjunction with CircuitPython language and library "stubs" managed by the extension. There are other excellent VS Code extensions and alternate IDEs that use a model having the workstation directly edit files on the CircuitPython drive should you prefer not to use the source-control-first methodology.

To return to this help file while using the extension run the `Welcome and Help` command, or click on one of the help icons in the title bar of many of the commands.

## Table of Contents ##
* [Getting Started](#getting-started)
* [Section 1](#section-1)
* [Section 2](#section-2)
* [Library Support](#library-support)
* [Board Support](#board-support)
* [Libs Copy Support](#libs-copy-support)
* [Files Copy Support](#files-copy-support)
* [Project Template Support](#project-template-support)
* [CP Drive Mapping](#cp-drive-mapping)
* [Board Downloading](#board-downloading)
* [Project Bundle Support](#project-bundle-support)

## Getting Started

The extension activates when a workspace is opened containing `code.py` or `main.py` python files and/or a folder for libraries named `lib` or `Lib`.  You can also manually start the extension (for instance in a blank workspace or where you have just created a python file) by running any of the commands, including `Welcome and Help` to show this file or one of the startup helpers like [Project Templates](#project-template-support) or [Project Bundles](#project-bundle-support).

For a simple application, create a code file (typically `code.py`), connect your board to a usb port on your workstation, map the CircuitPython drive using the [CP Drive Mapping](#cp-drive-mapping) command, and use the `Copy Files` command to push the code file to the board.  Then you can monitor and debug the application on the board using the VS Code built-in Serial monitor, making modifications and re-pushing to the board.

For more complicated applications that use sensors and other hardware you can add libraries with the extension [Library Support](#library-support) for Adafruit libraries, or add other libraries as needed.  Library files have a dedicated `Copy libs` command as well as offering intellisense through Adafruit published definition files downloaded by the extension (which also includes all the built-in modules in CircuitPython).  You can also select the type of board connected to leverage the extension [Board Support](#board-support) feature, giving auto-completion and validation of board definitions such as pins available.  The remainder of this help file gives details on all the commands and features of the extension.

One of the key ways in which the extension "protects" the integrity of your project is through extensive use of the VS code settings system.   

[Top](#welcome-to-circuitpython-sync)

## section 1

![CPS toolbar](cpstoolbarsmall.png)



help text 1

help text 1

help text 1

help text 1

help text 1

help text 1

[Top](#welcome-to-circuitpython-sync)

## section 2

help text 2

help text 2

help text 2

help text 2

help text 2

help text 2

help text 2

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

