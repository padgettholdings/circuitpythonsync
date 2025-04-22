import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ProjectBundleMgmt {

    // ** public variables

    // ** private variables
    private _context: vscode.ExtensionContext;
    //private _progInc: number;
    private _workspaceUri: vscode.Uri | undefined;
    private _projectBundleArchiveUri: vscode.Uri | undefined;
    private _projectBundleTempUri: vscode.Uri | undefined;

    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        this._workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
        this._projectBundleArchiveUri = vscode.workspace.workspaceFolders ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, strgs.projectBundleArchiveFolderName) : undefined;
        // ** don't create any proj bundle related folders until run command,
        //  also handles clearing out workspace after activate
        /*
        if(this._projectBundleArchiveUri && !fs.existsSync(this._projectBundleArchiveUri.fsPath)){
            fs.mkdirSync(this._projectBundleArchiveUri.fsPath);
        }
        */
        this._projectBundleTempUri = vscode.Uri.joinPath(this._context.globalStorageUri, strgs.projectBundleTempFolderName);
        /*
        if(!fs.existsSync(this._projectBundleTempUri.fsPath)){
            fs.mkdirSync(this._projectBundleTempUri.fsPath);
        }
        */
        // don't need progress for now...
        //this._progInc=0;    //set to greater than 100 to stop progress
        // **#72, quick pick command buttons
        const iconCommandHelp:ThemeIcon=new ThemeIcon('question');
        interface cmdQuickInputButton extends QuickInputButton {
            commandName: string;
        }
        // ** Command to load project bundle into workspace
        const loadProjectBundleCmdId:string=strgs.cmdLoadProjectBundlePKG;
        let cmdLoadProjectBundle = vscode.commands.registerCommand(loadProjectBundleCmdId, async () => {
            if(!this._workspaceUri){
                vscode.window.showErrorMessage(strgs.mustHaveWkspce);
                return;
            }
            // ** #72, quick input command button and input box
            const helpButton:cmdQuickInputButton={
                iconPath:iconCommandHelp,
                tooltip:strgs.helpTooltipMap.get(strgs.helpProjectBundleSupport),
                commandName:'help'
            };
            const projectBundleQuickInput = vscode.window.createInputBox();
            projectBundleQuickInput.buttons=[helpButton];
            projectBundleQuickInput.title=strgs.projectBundleUrlTitle;
            projectBundleQuickInput.prompt=strgs.enterProjectBundleUrl;
            projectBundleQuickInput.placeholder=strgs.projectBundleUrlPlaceholder;
            projectBundleQuickInput.onDidTriggerButton(async (button) => {
                const btn=button as cmdQuickInputButton;
                if (btn.commandName === 'help') {
                    projectBundleQuickInput.hide();
                    vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpProjectBundleSupport);
                }
            });
            projectBundleQuickInput.onDidAccept(async () => {
                const projectBundleUrl=projectBundleQuickInput.value;
                // validate the input
                if(!(projectBundleUrl && projectBundleUrl.toLowerCase().startsWith('https')) && !(projectBundleUrl==='')){
                    projectBundleQuickInput.validationMessage=strgs.enterProjectBundleUrl;
                } else {
                    // ask for the url to the project bundle
                    // const projectBundleUrl = await vscode.window.showInputBox({
                    //     title: strgs.projectBundleUrlTitle,
                    //     prompt: strgs.enterProjectBundleUrl,
                    //     placeHolder: strgs.projectBundleUrlPlaceholder,
                    //     validateInput: (input) => {
                    //         //if (!input || !input.toLowerCase().startsWith('https')) {
                    //         // ** #79 allow just enter to go into file pick
                    //         if(!(input && input.toLowerCase().startsWith('https')) && !(input==='')){
                    //             return strgs.enterProjectBundleUrl;
                    //         }
                    //         return null;
                    //     },
                    // });
                    // #79, if just enter, then use file picker, else undefined exits
                    if (projectBundleUrl===undefined) {
                        projectBundleQuickInput.hide();
                        return;
                    }
                    if(!this._workspaceUri){return;}    // just to satisfy typescript
                    // flag to indicate if we need to use file picker
                    let useFilePicker=false;
                    if (projectBundleUrl==='') {
                        useFilePicker=true;
                    }
                    // either the downloaded bundle or local file needs to go in to a temp directory
                    if(!this._projectBundleArchiveUri){
                        vscode.window.showErrorMessage(strgs.projectBundleArchiveDirNotInitErr);
                        projectBundleQuickInput.hide();
                        return;
                    } else {
                        if(!fs.existsSync(this._projectBundleArchiveUri.fsPath)){
                            fs.mkdirSync(this._projectBundleArchiveUri.fsPath);
                        }
                    }
                    // will need to track the filename since it will be different for url vs picked
                    let projBundleZipFilename:string='';
                    let projectBundleZipUri:vscode.Uri;
                    let projectBundleArchiveFile:string='';     // this is the eventual fspath to arch zip file
                    // if picking file try to get it with the file open; if cancel then bail
                    if(useFilePicker){
                        const projectBundleZipUriPick = await vscode.window.showOpenDialog({
                            canSelectMany: false,
                            canSelectFolders: false,
                            filters: {
                                'Zip Files': ['zip']
                            },
                            defaultUri: vscode.Uri.file(os.homedir())
                        });
                        if (!projectBundleZipUriPick || projectBundleZipUriPick.length===0) {
                            // user cancelled
                            projectBundleQuickInput.hide();
                            return;
                        }
                        // set the url to the picked file
                        projectBundleZipUri=projectBundleZipUriPick[0];
                        projBundleZipFilename=path.basename(projectBundleZipUri.fsPath);
                        // copy to the projectBundleArchiveUri so we can unzip it
                        const projectBundleArchiveFileUri = vscode.Uri.joinPath(this._projectBundleArchiveUri, projBundleZipFilename);
                        try {
                            await vscode.workspace.fs.copy(projectBundleZipUri, projectBundleArchiveFileUri, {overwrite:true});
                        } catch (error) {
                            vscode.window.showErrorMessage(this.getErrorMessage(error));
                            projectBundleQuickInput.hide();
                            return;
                        }
                        projectBundleArchiveFile=projectBundleArchiveFileUri.fsPath;  // this is the fspath to the archive zip file
                    } else {
                        // can hide the quick pick since download may take a bit
                        projectBundleQuickInput.hide();
                        // doing a url...
                        // try to get the id from the url, if not use the date
                        // example:
                        // https://learn.adafruit.com/elements/3192127/download?type=zip
                        const pat=/elements\/(\d+)\/download/;
                        const match=projectBundleUrl.toLowerCase().match(pat);
                        const id=match?match[1]:new Date().toISOString().split('T')[0].replace(/[^0-9]/g,'');
                        projBundleZipFilename=`projectBundle${id}.zip`;
                        projectBundleArchiveFile = path.join(this._projectBundleArchiveUri.fsPath, projBundleZipFilename);
                        // check to see if file already exists, offer to skip re-download
                        let skipDownload=false;
                        if(fs.existsSync(projectBundleArchiveFile)){
                            const ans=await vscode.window.showWarningMessage(strgs.projectBundleDnldExistsSkipQues,'Yes','No, download again','Help');
                            if(ans==='Yes'){
                                skipDownload=true;
                            } else if(ans==='Help'){
                                projectBundleQuickInput.hide();
                                vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpProjectBundleSupport);
                                return;
                            }
                        }
                        if (!skipDownload) {
                            try {
                                await this.downloadFile(projectBundleUrl, projectBundleArchiveFile);
                            } catch (error) {
                                vscode.window.showErrorMessage(this.getErrorMessage(error));
                                projectBundleQuickInput.hide();
                                return;
                            }
                        }
                    }
                    // now we have the project bundle zip file in the archive directory
                    //now extract into temp directory
                    if(!this._projectBundleTempUri){
                        vscode.window.showErrorMessage(strgs.projectBundleTempDirNotInitErr);
                        projectBundleQuickInput.hide();
                        return;
                    } else {
                        if(!fs.existsSync(this._projectBundleTempUri.fsPath)){
                            fs.mkdirSync(this._projectBundleTempUri.fsPath);
                        }        
                    }
                    const projectBundleTempDirUri = vscode.Uri.joinPath(this._projectBundleTempUri, projBundleZipFilename.replace(/\.zip$/,''));
                    try {
                        const unzip=new zl.Unzip({
                            overwrite: true
                        });
                        await unzip.extract(projectBundleArchiveFile, projectBundleTempDirUri.fsPath);
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(this.getErrorMessage(error));
                        projectBundleQuickInput.hide();
                        return;
                    }
                    // now read down through the extracted files/folders, looking for circuitpython N.x
                    let foundCPy=false;
                    let curProjBundleTempDirFinalUri:vscode.Uri=vscode.Uri.file('');   // final circuitpython dir
                    // keep array of readme files if found down through dirs so can copy to workspace
                    let readmeFiles:string[]=[];
                    let curProjBundleTempDirUri=projectBundleTempDirUri;
                    while(!foundCPy){
                        let lastProjBundleTempDirUri=curProjBundleTempDirUri;
                        const tmpDirContents=await vscode.workspace.fs.readDirectory(curProjBundleTempDirUri);
                        for(const [name,type] of tmpDirContents){
                            // check for readme 
                            if(type===vscode.FileType.File && name.toLowerCase().startsWith('readme')){
                                // keep track of any readme files found so can copy to workspace
                                readmeFiles.push(vscode.Uri.joinPath(curProjBundleTempDirUri,name).fsPath);
                            }
                            if(type===vscode.FileType.Directory &&  /circuitpython\s+[0-9](?:\.x)?/i.test(name.toLowerCase()  )){       //startsWith('circuitpython')){
                                curProjBundleTempDirFinalUri=vscode.Uri.joinPath(curProjBundleTempDirUri,name);
                                foundCPy=true;
                                //break;
                            }
                                if(type===vscode.FileType.Directory){
                                    lastProjBundleTempDirUri=vscode.Uri.joinPath(curProjBundleTempDirUri,name);
                                }
                            
                        }
                        // if did not find cp dir, and did not change the directory, then no more dirs to go down
                        if(foundCPy || curProjBundleTempDirUri.fsPath===lastProjBundleTempDirUri.fsPath){
                            break;
                        } else {
                            curProjBundleTempDirUri=lastProjBundleTempDirUri;
                        }
                    }
                    if(!foundCPy){
                        vscode.window.showErrorMessage(strgs.projectBundleNoFindCPinZipErr);
                        // ** cleanup the temp
                        fs.rmdirSync(projectBundleTempDirUri.fsPath, { recursive: true });
                        projectBundleQuickInput.hide();
                        return;
                    }
                    //now read the cp directory and copy all files and folders to the workspace
                    //####TBD#### ask if can overwrite
                    const projBundleContents=await vscode.workspace.fs.readDirectory(curProjBundleTempDirFinalUri);
                    // check to see if any of the files or folders from bundle will
                    //   overwrite in the workspace
                    // ** don't worry about readme files, will copy first then can be overwritten
                    const wscontents=await vscode.workspace.fs.readDirectory(this._workspaceUri);
                    for(const [name,type] of projBundleContents){
                        if(wscontents.some(fle => fle[0].toLowerCase()===name.toLowerCase())){
                            //something matches, ask if want to overwrite, if not bail out
                            const ans=await vscode.window.showWarningMessage(strgs.projectBundleOverwriteConfirm,'Yes','No, cancel');
                            if(ans==='Yes'){
                                break;
                            } else {
                                projectBundleQuickInput.hide();
                                return;
                            }
                        }
                    }
                    // copy any readme files found to the workspace
                    for(const readmeFile of readmeFiles){
                        const readmeFileUri=vscode.Uri.file(readmeFile);
                        const readmeDestUri=vscode.Uri.joinPath(this._workspaceUri,path.basename(readmeFile));
                        await vscode.workspace.fs.copy(readmeFileUri, readmeDestUri, {overwrite:true});
                    }
                    // now copy the contents of the project bundle to the workspace
                    for(const [name,type] of projBundleContents){
                        const flfldrTocopy=vscode.Uri.joinPath(curProjBundleTempDirFinalUri,name);
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
                    // ask user about other actions
                    const ansTemplate=await vscode.window.showInformationMessage(strgs.projectBundleGetSettingsQues,'Yes','No');
                    if(ansTemplate==='Yes'){
                        // use the special hiddent command to add only new files and merge settings
                        vscode.commands.executeCommand(strgs.cmdScaffoldProjectPKG,strgs.projTemplateQPItemHiddenAddNewWSettings);
                    }
                    /*
                    const ans=await vscode.window.showInformationMessage('Project bundle loaded, do you want to update libraries?','Yes','No');
                    if(ans==='Yes'){
                        vscode.commands.executeCommand(strgs.cmdLibUpdatePKG);
                    }
                    */
                    projectBundleQuickInput.hide();
                }
            });
            projectBundleQuickInput.onDidHide(() => {
                projectBundleQuickInput.dispose();
            });
            projectBundleQuickInput.show();
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