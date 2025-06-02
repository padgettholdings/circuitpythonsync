# Change Log

## [Unreleased]
* Initial private development in 2025.

## v0.1.0 - 2025-05-12
* Initial pre-release version.

## v0.1.1 - 2025-05-15
* Second pre-release version with icon and preview flag

## v0.1.2 - 2025-05-15
* Third pre-release version with modified icon

## v0.2.0 - 2025-05-15
* First preview release

## v0.2.1 - 2025-05-19
* Second preview release with new features: 
    * Startup modal that offers potential CP drive now recognizes that settings have a current mapping and makes it clear that offered mapping will change that.
    * When comparing a workspace file to the mapped CP board, if the filename in the workspace is not found on the board there was just an error.  But if the file map manifest has a mapping for that workspace file to a name that does exist on the board, the extension will now offer to compare those two files.

## v0.2.2 - 2025-05-25
* Third preview release with new feature:
    * Add context menu in the board explorer to download a single file to the workspace.  Has overwrite protection with an option to make a .copy version.

## v0.2.3 - 2025-05-28
* Fourth preview release with new feature:
    * Decorate libraries and files that are configured to be copied to the board.  Both a color and a badge show up in the file explorer and on the tabs of any files opened for edit.  Help file updated to include this feature.

## v0.2.4 - 2025-05-31
* Fifth preview release with new features and bug fixes:
    * In file copy management, add ability to designate files in folders such as `/assets` to be copied.  Folders limited to non-system folders like `.vscode` or `.git`.
    * Enhanced file decoration to include folders that have files configured to be copied.  The "bubble" badge is similar to the one used for vscode functions such as source control.  Also applies to `lib` folder if specific libraries are configured to be copied.  The full badge is still shown if the whole library folder is the default copy.
    * Fix bug in board explorer where delete or download gave error after board drive changed.

## v0.2.5 - 2025-06-02
* Sixth preview release with bug fix:
    * The file copy configuration command was showing a generic warning if it could not detect any python files to be copied.  The message did not acknowledge that renamed copies (with the -> operator) may be python files.  Also if any non-python files were configured it said the default code/main.py would be copied.  New messages and better logic were added to clarify this.
  
