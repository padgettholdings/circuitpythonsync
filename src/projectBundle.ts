import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings.js';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class LibraryMgmt {

    // ** public variables

    // ** private variables
    private _context: vscode.ExtensionContext;
    private _progInc: number;

    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        const workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : vscode.Uri.file(os.homedir());

        interface cmdQuickInputButton extends QuickInputButton {
            commandName: string;
        }
        //const iconCommand1:ThemeIcon=new ThemeIcon('library');

        interface cmdQuickItem extends vscode.QuickPickItem {
            commandName: string;
        }
        this._progInc=0;    //set to greater than 100 to stop progress
    }
}