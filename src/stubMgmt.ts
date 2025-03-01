import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings.js';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as tar from 'tar';
import { promises } from 'dns';

export class StubMgmt {
    private _context: vscode.ExtensionContext;
    private _progInc:number = 0;
    private _workspaceUri: vscode.Uri | undefined;
    private _stubZipArchiveUri: vscode.Uri | undefined;
    private _stubsDirUri: vscode.Uri;
    private _cpVersionFull: string = '';
    private _cpVersionFullStubUri: vscode.Uri | undefined;

    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        this._workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
        this._stubZipArchiveUri = vscode.workspace.workspaceFolders ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'stubArchive') : undefined;
        this._progInc=0;    //set to greater than 100 to stop progress

        if(!fs.existsSync(this._context.globalStorageUri.fsPath)){
            fs.mkdirSync(this._context.globalStorageUri.fsPath);
        }
        this._stubsDirUri = vscode.Uri.joinPath(this._context.globalStorageUri, 'stubs');
        if(!fs.existsSync(this._stubsDirUri.fsPath)){
            fs.mkdirSync(this._stubsDirUri.fsPath);
        }

        const selectBoardCmd=vscode.commands.registerCommand('circuitpythonsync.selectBoard', async () => {
            if(!this._workspaceUri){
                vscode.window.showErrorMessage(strgs.mustHaveWkspce);
                return;
            }
            //check for cp full version
            const cpVersionFull:string = vscode.workspace.getConfiguration().get('circuitpythonsync.cpfullversion','');
            if(cpVersionFull===''){
                vscode.window.showErrorMessage('Must set the CircuitPython full version in the settings.');
                return;
            }
            this._cpVersionFull = cpVersionFull;
            //this._cpVersionFullStubUri = vscode.Uri.joinPath(this._stubsDirUri, 'circuitpython_stubs-'+this._cpVersionFull);
            // let the install chech all parts of stub setup
            try{
                await this.installStubs();
            }catch(err){
                vscode.window.showErrorMessage('Error downloading stubs: '+err);
                return;
            }


            const boardList = await this.getBoardList();
            const board = await vscode.window.showQuickPick(boardList, { placeHolder: '' });
            if (board) {
                //const boardInfo = await this.getBoardInfo(board);
                //const boardPath = await this.getBoardPath(boardInfo);
                //await this.installBoard(boardPath);
            }
        }
        );
        context.subscriptions.push(selectBoardCmd);
    }

    // **private methods**

    private async getBoardList(): Promise<vscode.QuickPickItem[]> {
        throw new Error('Method not implemented.');
    }

    private async extractTarGz(tarGzPath: string, extractPath: string) {
        try {
            await tar.x({
                file: tarGzPath,
                cwd: extractPath
            });
            console.log(`Extracted ${tarGzPath} to ${extractPath}`);
        } catch (error) {
            console.error(`Error during extraction of ${tarGzPath}:`, error);
            throw new Error(`Error during extraction of ${tarGzPath}:`);
        }
    }
    

    // **public methods**

    // get stubs into global storage, download if necessary, only call if have workspace
    public async installStubs(): Promise<void> {
        if(this._cpVersionFull===''){
            //vscode.window.showErrorMessage('Must set the CircuitPython full version in the settings.');
            throw new Error('Must set the CircuitPython full version in the settings.');
        }
        this._cpVersionFullStubUri = vscode.Uri.joinPath(this._stubsDirUri, 'circuitpython_stubs-'+this._cpVersionFull);
        if(fs.existsSync(this._cpVersionFullStubUri.fsPath)){
            //stubs already installed
            return;
        }
        // now check to see if the archive zip for this version is already downloaded
        if(!this._stubZipArchiveUri){return;}  //should not happen
        const stubZipArchiveTarUri = vscode.Uri.joinPath(this._stubZipArchiveUri, 'circuitpython_stubs-'+this._cpVersionFull+'.tar.gz');
        if(fs.existsSync(stubZipArchiveTarUri.fsPath)){
            //need to extract the tar file
            await tar.x({file:stubZipArchiveTarUri.fsPath, cwd:this._stubsDirUri.fsPath});
            return;
        }


        if(!fs.existsSync(this._cpVersionFullStubUri.fsPath)){
            //will need to download the stubs for this version of CP
            await this.downloadStubs();
        }
        //now we have the stubs, need to install them
        await this.installStubsFromDir(this._cpVersionFullStubUri);
    }
}
