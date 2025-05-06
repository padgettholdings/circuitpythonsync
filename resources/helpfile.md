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

In addition to showing the files and folders on the mapped board, the explorer enables actions: file deletion (right click on a file); opening the drive in the operating system (file explorer on Windows, Finder on MacOS, terminal on Linux); and refreshing the view when changes occur outside the extension.  The board files can also be downloaded to your workspace with various options as detailed in [Board Downloading](#board-downloading).

While not directly accessible from the explorer, there is a companion command that compares a file in the workspace with the same file on the board.  This is useful for checking if a file has been modified on the board or in the workspace.  The command is `Compare File to Board` and can be run from the command palette or by right-clicking on a file in the explorer.

[Top](#welcome-to-circuitpython-sync)

## CircuitPython Language Support

VS Code provides first-class python coding tools through the Microsoft-provided Python extensions Python and Pylance (these will be installed when you install this extension if you don't have them.)  These offer formatting, linting, intellisense, etc. for the Python language real-time during coding.  For example, if you fail to indent the first line after a def statement:

![Basic Python validation](python0.png)

This extension adds support for CircuitPython-specific built-in modules and libraries by downloading the latest CircuitPython bundle from Adafruit and extracting the built-in modules and libraries into a folder in your workspace.   The extension then configures the python language services to use these folders as part of the python path, enabling intellisense and validation for all the built-in modules and libraries.

For example, using the built-in alarm module for sleeping will auto-complete the types of alarms available:

![CP Built-ins](python1.png)

If you are working with a sensor supported by a library in the standard bundle, the properties and methods of the library will also be available for auto-completion:  

![Library Auto-complete](python2.png)

Details of the library are also available in the hover tooltip:

![Library Details](python3.png)

The extension also downloads the latest CircuitPython board definition files from Adafruit and extracts them into a folder in your workspace.  The extension then configures the python language services to use these folders as part of the python path, enabling intellisense and validation for all the built-in modules and libraries.  For example, pin definitions are available for auto-completion:

![Board Auto-complete](python4.png)

Details of the board are also available in the hover tooltip:

![Board Details](python5.png)

While highly recommended, the CircuitPython language support is not required for the extension to support the basic workflow of copying files and libraries to the board.  More details on the CircuitPython language support can be found in the [Library Support](#library-support) and [Board Support](#board-support) sections below.

[Top](#welcome-to-circuitpython-sync)

## CP Drive Mapping

Configuring the attached board drive is a key step in the development workflow to enable code files and libraries to be uploaded to your board.  The drive set command can be run from the command palette or by clicking the `Map CP Drive` button on the toolbar.  The command will show a dialog with a list of available drives and a `Pick Manually` selection to select any file path.  The dialog will also show the current mapping if any.

The extension queries the operating system for available drives and shows them in the dialog.  The list includes any removable drives that have the `boot_out.txt` file in the root of the drive.  This file is created by CircuitPython when the board is connected to the workstation and is used by the extension to identify the drive as a potential CircuitPython drive.  Then the "most likely" board drive(s) (listed as Auto Detected) has a disk label of `CIRCUITPY`.  For example on Windows the mapping command may show:

![Drive Mapping](drivemap.png)

Here the `D:` drive had the correct volume label, but an SD card mounted as the `F:` drive had a `boot_out.txt` file that had been used for testing.  In fact, any file directory can be selected by choosing the `Pick Manually` option and selecting a folder.  One use case for this feature is for making a copy of the development files and libraries on a removable drive and later copying to the board on a different workstation.

For MacOS and Linux, the selected drive path will show as something like `/Volumes/CIRCUITPY` or `/media/username/CIRCUITPY`.  In all cases the proper string will be saved in the workspace settings so that the extension can find the drive again when you open the workspace.

[Top](#welcome-to-circuitpython-sync)

## Library Support

Many CircuitPython applications use libraries to support the hardware and sensors used in the application.  For example, the following illustrates a simple application using a popular sonar distance sensor:

![Simple CP Project](simplecp.png)

Since the CP runtime on boards is opinionated to use a folder in the root named `lib` or `Lib` for libraries, the extension uses the same folder name in the workspace to hold the libraries.  Libraries may be single files or folders containing multiple files.  They may be sourced from the official Adafruit CircuitPython bundle or from other sources such as the community bundle.  This extension can currently automatically download the Adafruit CP bundle; however, any CP compatible library can be used by copying the files/folders into the `lib` folder.  Then the `Copy Libs to Board` command will copy the libraries to the board.

Automated handling of the Adafruit bundle is initiated by running the `Install or Update Libraries and Stubs`command (this will be prompted during startup if a lib folder exists but the archive has not been created).  This command will download the latest bundle (or a specified version) from Adafruit into an archive folder in your workspace, as shown in this example:

![Simple CP with Libs](simplecplibs.png)

For any libraries that are in the `lib` folder (or that are copied in later), the extension will extract plain text `.py` versions from the bundle files and place them in a `libstubs` folder in the lib archive folder.  Then the extension configures the python language services to use these folders as part of the python path, enabling intellisense and validation for all the the libraries being used.  For example, the configuration in settings.json might look like:

```json
"python.analysis.extraPaths": [
        "c:\\myuser\\myprojects\\simpleCp\\libArchive\\libstubs",
    ]
```

The `.py` files in the `libstubs` folder are used for intellisense and validation only; the standard bundle files are compressed/compiled `.mpy` files in the `lib` folder used by the CP runtime. Note that if you have a custom or other 3rd party library in the `lib` folder that is in `.py` format, you can add another path to the `python.analysis.extraPaths` setting to enable intellisense and validation for that library as well.  Just use the path to the `lib` folder itself; Pylance will ignore the `.mpy` files and just search for `.py` files.

Once the library support has been installed the `Select Libraries` command will add and/or remove libraries sourced from the standard bundle.  Added libraries will be copied to the `lib` folder with `.py`' versions updated in the `libstubs` folder; removed libraries will be deleted from the `lib` folder and the `libstubs` folder.  The command will also add any dependency libraries needed by the selected libraries; this is based on metadata downloaded with the chosen release version of the bundle.

The `Install or Update Libraries and Stubs` also downloads "stubs" for the CircuitPython built-in modules and board definitions.  This is further described in the following section on Board Support.

[Top](#welcome-to-circuitpython-sync)

## Board Support

The extension offers language support for specific board definitions as well as the CircuitPython board runtime built-in modules.  It does this by downloading "stubs" for the version of CP specified in the `Install or Update Libraries and Stubs` command or previously saved in the workspace settings.  These stubs are `.pyi` interface files (vs the entire source code) that are used by the python language services to provide intellisense and validation for the built-in modules and board definitions.  The downloaded compressed stubs are saved in a `stubArchive` folder in the workspace to preserve the version of the stubs used for the project; you can choose to include this folder in your source control repo, if not it can be re-downloaded when the repo is next pulled down.  The uncompressed stub directory is extracted to a global cache provided by VS Code; the directory can be somewhat large and you would not need to include it in your workspace.  The extension configures the python language services to use these folders as part of the python path, enabling intellisense and validation for all the built-in modules and libraries.  For example, the configuration in settings.json might look like:

```json
    "python.analysis.extraPaths": [
        "c:\\user-app-data\\globalStorage\\extensionname\\stubs\\circuitpython_stubs-9.2.7"
    ]
```

This enables language support for CP built-ins, such as `digitalio`, `analogio`, etc.  It also contains support for the basic `board` module with functions such as `I2C`, `SPI`, etc. common to all boards.  To get support for specific boards, run the `Select Board` toolbar button or command and choose from the list of boards supported in the version of CP you chose in the `Install or Update Libraries and Stubs` command.  

```json
    "python.analysis.extraPaths": [
        "c:\\user-app-data\\globalStorage\\extensionname\\stubs\\circuitpython_stubs-9.2.7\\board_definitions\\adafruit_feather_esp32s2",
    ],
```

With this path pointing to the selected board definition folder, you will get intellisense and validation for the board definition.  For example, the `board` module will have all the pins available for the selected board.

With all of the python extraPaths noted in this and the last section, a typical settings section might look like:

```json
    "python.analysis.extraPaths": [
        "c:\\user-app-data\\globalStorage\\extensionname\\stubs\\circuitpython_stubs-9.2.7",
        "c:\\user-app-data\\globalStorage\\extensionname\\stubs\\circuitpython_stubs-9.2.7\\board_definitions\\adafruit_feather_esp32s2",
        "c:\\myuser\\myprojects\\simpleCp\\libArchive\\libstubs",
    ]
```

Note that while the paths are specific to the workstation or remote server being used for development, the extension will automatically update the paths in the settings file if you change the workspace location or move the project to a different workstation.


[Top](#welcome-to-circuitpython-sync)

## Libs Copy Support

As noted in the Toolbar section above the extension provides a `Copy Libs to board` command that copies some or all of the files and folders in the `lib` folder to the board mapped drive.  If you need all the libraries copied to the board, no other configuration is needed.  Any newly selected libraries will also be copied to the board.  There are scenarios where a subset of the libraries in the `lib` folder need to be copied.  For example, during prototyping several different sensors may be used with different libraries involved.  While normally copying different libraries for similar sensors to a board is not an issue, there can be conflicts such as versions of dependencies and storage space.  This extension offers the `Manage Libs Copy` command to craft a copy manifest that can be used to enable selective copy of the contents of the libraries folder.  

The default filename of the manifest file is `cpfiles.txt`, but this can be changed in settings.  The file is located in the `.vscode` folder in the workspace.  The file is a simple text file with one line per library to be copied.  When executing the copy command the extension will check the `lib` folder for the libraries listed in the manifest and copy them to the board.  If a library is not found, it will be skipped.  If the file is missing or no libraries are listed, the extension will copy all the libraries in the `lib` folder.  The manifest file is not required for the extension to work; it is only used if you want to limit the libraries copied to the board.  The file is also used to tailor file copies (see the next section).

An example of using the manifest file is choosing between a sonar sensor or a time of flight sensor during prototyping.  The `Manage Libs Copy` command shows all libraries in the `lib` folder, but then you can deselect those you are not working with at a point during development, like:

![Manage Libs 1](cpfileslib1.png)

which results in a manifest file like:

![Manage Libs 2](cpfileslib2.png)

Then when you are ready to try the other sensor you can reverse the selections.  The Copy Libs command clears out any prior libraries on the board that are not included in the current copy.  As an alternative, the extension supports commenting out lines by editing the manifest file:

![Manage Libs 3](cpfileslib3.png)

which results in the same selections in the command:

![Manage Libs 4](cpfileslib4.png)

The commenting feature makes it a bit quicker to flip back and forth between library sets.

[Top](#welcome-to-circuitpython-sync)

## Files Copy Support

The `Manage Files Copy` command is similar to the `Manage Libs Copy` command, but it is used to manage the non-library files copied to the board. The copy logic is similar to the library copy: if `cpfiles.txt` is missing or has no non-library files, only the main python files (`code.py` or `main.py`) will be copied.  The command lets you select from all the possible files that can be copied:

![Manage Files 1](cpfiles1.png)

The resulting manifest file will then look like:

![Manage Files 2](cpfiles2.png)

The commenting feature noted above for libraries also works for the files copy settings.  There is an additional feature that copies a file from the workspace to a different filename on the board.  This is useful if you have several versions of a file you are testing (for example `code1.py` and `code2.py`) and you want to copy one of them to the board as `code.py` or `main.py`.  The syntax is shown below with a `->` chord between the source and destination filenames.  You can then use the commenting feature to select which source file to copy:

![Manage Files 3](cpfiles3.png)

Note that unlike the library copy, the files copy does not clear out any prior files on the board that are not included in the current copy manifest.  You can use the board explorer to delete files as noted in prior sections.


[Top](#welcome-to-circuitpython-sync)

## Project Template Support

As noted in the [Getting Started](#getting-started) section, the extension offers a method to create a new project or add features to an existing project using the `Make or Update Project from Templates` command.  Templates are plain text files with file-path delimited sections containing file contents.  A default template is included with the extension but you can create your own templates and apply them with the command.  The command will initially look like:

![Proj Template Cmd](projtemplate1.png)

The "Apply Template" section highlighted in green shows the actions that can be done using the template noted in the placeholder above as `(from default)`, indicating the actions will use the default template.  The "Templates" section highlighted in yellow accesses a sub-command to pick a different template or manage your list of templates.  The last selection in the "Templates" section lets you view the currently selected template; this is also the way you can copy existing templates to make a new one. (An example of a template is shown below.)

The three actions available in the "Apply Template" section are:

*  **All files...** - this will copy all the files in the template to the workspace.  This is useful for creating a new project from scratch or adding specific files or settings to an existing project.  A warning with a cancellation option will be shown if any of the files already exist in the workspace; settings are always merged.
*  **Merge settings...** - this only merges settings from the template into the workspace settings.
*  **Add Sample Files...** - basically the same as the first option, but if a template file exists in the workspace the file will be copied in but with `.sample` added as an extension.

In the "Templates" section, the "Choose different template..." option will show a list of your available templates along with an option to return to the default template.  When a template is chosen the main command is shown again with the new template name in the placeholder.

![Choose template](projtemplate2.png)

As seen in this illustration, you can save your own templates in one of several locations:
* **Local file path** - the template must be plain text; it should have a helpful filename with a `.txt` extension.  While the template can be in the workspace (a sub-folder is recommended), the path saved is absolute; if the repo is restored to a different folder or another workstation the reference will need to be deleted and re-added (see below).
* **Private GitHub repo or gist** - If you have your GitHub account saved in VS Code you can save your custom template as a text file in one of your repos or as a gist.  The file should have a helpful filename and a `.txt` extension.  Be sure to use the raw link to the file when adding to your list.  Note that public repos and gists are also supported.
* **Public website** - the same as above, but the file must be available with no authentication required.  This is useful for sharing templates with others.

When the "Add new template..." option is selected in the "Choose personal template" command, another sub-command comes up which allows you to add new files or URL's, or remove existing ones.

![alt text](projtemplate3.png)

You can add as many new entries as you have templates, then hit Escape to return to the "Choose personal template" command.  This command is also available in the command palette as `Manage Templates`.  The list of available templates is saved in your user settings, not the workspace since you often want to start a new project with a blank workspace.

As noted above, the format of a template file is a stream of text with file-path delimited sections.  File paths start with `>>>` at the beginning of a line, followed by the relative path of the file.  A path with only a trailing `/` will create the folder.  All file content between the path delimiters must be plain text; it is not a recommended way to include library files, see [Library Support](#library-support) instead.  Some samples from the default template file is shown below:

```text
>>>code.py
#sample circuitpython main code file
import time

while True:
    print('hello circuitpython!')
    time.sleep(2)

>>>lib/

>>>settings.toml
# To auto-connect to Wi-Fi on enabled boards uncomment and enter correct info
#CIRCUITPY_WIFI_SSID="mywifissd"
#CIRCUITPY_WIFI_PASSWORD="mysecretpassword"

>>>.gitignore
# Sometimes it can be useful...

...


>>>.vscode/settings.json
{
    "python.languageServer": "Pylance",
    "python.analysis.diagnosticSeverityOverrides": {
        "reportMissingModuleSource": "none",
        "reportShadowedImports": "none"
    }
}
```
When "All Files..." action is run with this template selected the following occurs:
* The `code.py` file is created with the sample code in the workspace root folder.
* The `lib` folder is created in the workspace root folder.
* The `settings.toml` file is created in the workspace root folder. 
* The `.gitignore` file is created in the workspace root folder.  There are some example entries in the default template that are commented out but can be uncommented to tailer the commits to your repo.
* The `settings.json` file is created in the `.vscode` folder in the workspace if it does not exist (with the `.vscode` folder created if it does not yet exist).  If the file already exists, the settings in the template are merged with the existing settings.  The default template includes some recommended settings for CircuitPython development including explicit callout of the Pylance language server, and some settings that prevent warnings if your `code.py` filename overrides your default workstation python settings.

Templates can be handy to simply add settings, such as:

```text
>>>.vscode/settings.json
{
     "python.analysis.typeCheckingMode": "basic"
}
```
This tells the python language server to check for errors (by default only informational notices are given.).  This would, for example, give an error if you tried to use a pin on a board that doesn't have that pin in its definition.

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

