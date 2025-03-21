import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings.js';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ProjectBundleMgmt {

    // ** public variables

    // ** private variables
    private _context: vscode.ExtensionContext;
    private _progInc: number;
    private _workspaceUri: vscode.Uri | undefined;
    private _projectBundleArchiveUri: vscode.Uri | undefined;
    private _projectBundleTempUri: vscode.Uri | undefined;

    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        this._workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
        this._projectBundleArchiveUri = vscode.workspace.workspaceFolders ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'projectBundleArchive') : undefined;
        if(this._projectBundleArchiveUri && !fs.existsSync(this._projectBundleArchiveUri.fsPath)){
            fs.mkdirSync(this._projectBundleArchiveUri.fsPath);
        }
        this._projectBundleTempUri = vscode.Uri.joinPath(this._context.globalStorageUri, 'projectBundleTemp');
        if(!fs.existsSync(this._projectBundleTempUri.fsPath)){
            fs.mkdirSync(this._projectBundleTempUri.fsPath);
        }

        // interface cmdQuickInputButton extends QuickInputButton {
        //     commandName: string;
        // }
        // //const iconCommand1:ThemeIcon=new ThemeIcon('library');

        // interface cmdQuickItem extends vscode.QuickPickItem {
        //     commandName: string;
        // }
        this._progInc=0;    //set to greater than 100 to stop progress

        // ** Command to load project bundle into workspace
        const loadProjectBundleCmdId:string='circuitpythonsync.loadProjectBundle';
        let cmdLoadProjectBundle = vscode.commands.registerCommand(loadProjectBundleCmdId, async () => {
            if(!this._workspaceUri){
                vscode.window.showErrorMessage(strgs.mustHaveWkspce);
                return;
            }
            // ask for the url to the project bundle
            const projectBundleUrl = await vscode.window.showInputBox({
                prompt: strgs.enterProjectBundleUrl,
                placeHolder: strgs.projectBundleUrlPlaceholder,
                validateInput: (input) => {
                    if (!input || !input.toLowerCase().startsWith('https')) {
                        return strgs.enterProjectBundleUrl;
                    }
                    return null;
                },
            });
            if (!projectBundleUrl) {
                return;
            }
            // try to download the bundle to a temp directory
            if(!this._projectBundleArchiveUri){
                vscode.window.showErrorMessage('cannot get project bundle archive directory');
                return;
            }
            // try to get the id from the url, if not use the date
            // example:
            // https://learn.adafruit.com/elements/3192127/download?type=zip
            const pat=/elements\/(\d+)\/download/;
            const match=projectBundleUrl.toLowerCase().match(pat);
            const id=match?match[1]:new Date().toISOString().split('T')[0].replace(/[^0-9]/g,'');
            const projectBundleArchiveFile = path.join(this._projectBundleArchiveUri.fsPath, `projectBundle${id}.zip`);
            try {
                await this.downloadFile(projectBundleUrl, projectBundleArchiveFile);
            } catch (error) {
                vscode.window.showErrorMessage(this.getErrorMessage(error));
                return;
            }
            //now extract into temp directory
            if(!this._projectBundleTempUri){
                vscode.window.showErrorMessage('cannot get project bundle temp directory');
                return;
            }
            const projectBundleTempDirUri = vscode.Uri.joinPath(this._projectBundleTempUri, `projectBundle${id}`);
            try {
                const unzip=new zl.Unzip({
                    overwrite: true
                });
                await unzip.extract(projectBundleArchiveFile, projectBundleTempDirUri.fsPath);
            }
            catch (error) {
                vscode.window.showErrorMessage(this.getErrorMessage(error));
                return;
            }
            // now read down through the extracted files/folders, looking for circuitpython N.x
            let foundCPy=false;
            let curProjBundleTempDirUri=projectBundleTempDirUri;
            while(!foundCPy){
                const tmpDirContents=await vscode.workspace.fs.readDirectory(curProjBundleTempDirUri);
                for(const [name,type] of tmpDirContents){
                    if(type===vscode.FileType.Directory && name.toLowerCase().startsWith('circuitpython')){
                        curProjBundleTempDirUri=vscode.Uri.joinPath(curProjBundleTempDirUri,name);
                        foundCPy=true;
                        break;
                    }
                    if(type===vscode.FileType.Directory){
                        curProjBundleTempDirUri=vscode.Uri.joinPath(curProjBundleTempDirUri,name);
                    }
                }
            }
            if(!foundCPy){
                vscode.window.showErrorMessage('Did not find CircuitPython code folder in project bundle.');
                return;
            }
            //now read the cp directory and copy all files and folders to the workspace
            //####TBD#### ask if can overwrite
            const projBundleContents=await vscode.workspace.fs.readDirectory(curProjBundleTempDirUri);
            // check to see if any of the files or folders from bundle will
            //   overwrite in the workspace
            const wscontents=await vscode.workspace.fs.readDirectory(this._workspaceUri);
            for(const [name,type] of projBundleContents){
                if(wscontents.some(fle => fle[0].toLowerCase()===name.toLowerCase())){
                    //something matches, ask if want to overwrite, if not bail out
                    const ans=await vscode.window.showWarningMessage('Some bundle content will overwrite existing, continue?','Yes','No, cancel');
                    if(ans==='Yes'){
                        break;
                    } else {
                        return;
                    }
                }
            }

            for(const [name,type] of projBundleContents){
                const flfldrTocopy=vscode.Uri.joinPath(curProjBundleTempDirUri,name);
                const flfldrDest=vscode.Uri.joinPath(this._workspaceUri,name);
                if(type===vscode.FileType.Directory){
                    await vscode.workspace.fs.copy(flfldrTocopy,flfldrDest,{overwrite:true});
                } else {
                    await vscode.workspace.fs.copy(flfldrTocopy,flfldrDest,{overwrite:true});
                }
            }
            // cleanup
            //fs.unlinkSync(projectBundleArchiveFile);
            fs.rmdirSync(projectBundleTempDirUri.fsPath, { recursive: true });
            const ans=await vscode.window.showInformationMessage('Project bundle loaded, do you want to update libraries?','Yes','No');
            if(ans==='Yes'){
                vscode.commands.executeCommand(strgs.cmdLibUpdatePKG);
            }
        });
        this._context.subscriptions.push(cmdLoadProjectBundle);


    }

    // ** public functions

    // ** private functions
    // utility to get message from error
    private getErrorMessage(error: any): string {
        if (error instanceof Error) {
            return error.message;
        } else if (typeof error === 'string') {
            return error;
        } else {
            return 'An unknown error occurred';
        }
    }

    // download a file from a url to a target location
    private async downloadFile(url: string, targetPath: string): Promise<void> {
        const response = await axios.default.get(url, { responseType: 'stream' });
        const writer = fs.createWriteStream(targetPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }
}