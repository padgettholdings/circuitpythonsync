import * as vscode from 'vscode';
import * as strgs from './strings.js';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class LibraryMgmt {
    constructor(context: vscode.ExtensionContext) {
        const openLibCmd=vscode.commands.registerCommand('extension.openLibraryMgmt', () => {
            vscode.window.showInformationMessage('Library Management');
        });
        context.subscriptions.push(openLibCmd);



        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this._statusBarItem.command = 'extension.openLibraryMgmt';
        this._statusBarItem.show();
        
    }

    public updateLibraryStatus() {
        this._statusBarItem.text = 'xxxxx';  //strgs.LIBRARY_STATUS;
    }

    private _statusBarItem: vscode.StatusBarItem;

    


}
