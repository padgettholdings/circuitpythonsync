import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings.js';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {getLibPath} from './extension.js';
//import { timeStamp } from 'console';

export class LibraryMgmt {
    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        const workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : vscode.Uri.file(os.homedir());
        this._libArchiveUri=vscode.Uri.joinPath(workspaceUri,strgs.workspaceLibArchiveFolder);

        interface cmdQuickInputButton extends QuickInputButton {
			commandName: string;
		}
		const iconCommand1:ThemeIcon=new ThemeIcon('library');

        interface cmdQuickItem extends vscode.QuickPickItem {
            commandName: string;
        }
        this._progInc=0;    //set to greater than 100 to stop progress

        const libUpdateCmdId=strgs.cmdLibUpdatePKG;
        const updateLibCmd=vscode.commands.registerCommand(libUpdateCmdId, async () => {
            //first make sure ready- **NO** update will check
            //const ready=await this.readyForLibCmds();
            //do quick input to show the libtag and cpversion and allow to change
            const pickButton:cmdQuickInputButton={
                iconPath:iconCommand1,
                tooltip:strgs.updateLibQPSelTT,
                commandName:"selectLibs"
            };    
            const quickPick = vscode.window.createQuickPick<cmdQuickItem>();
            quickPick.title = strgs.updateLibQPtitle;
            quickPick.buttons = [pickButton];
            quickPick.placeholder = strgs.updateLibQPSelPlaceholder;
            quickPick.items = [
                { label: strgs.updateLibQPItemTop.label, description: strgs.updateLibQPItemTop.description, commandName: 'update' },
                { label: strgs.updateLibQPItemMiddle.label, description: this._libTag, commandName: 'libtag' },
                { label: strgs.updateLibQPItemBottom.label, description: this._cpVersion, commandName: 'cpversion' }
            ];
            quickPick.onDidTriggerButton((button) => {  
                const btn=button as cmdQuickInputButton;
                if (btn.commandName === 'selectLibs') {
                    quickPick.hide();
                    quickPick.dispose();
                    vscode.commands.executeCommand(strgs.cmdSelectLibsPKG);
                }
            });
            quickPick.onDidChangeSelection(async (items) => {
                if(items[0].commandName==='update') {
                    quickPick.hide();
                    quickPick.dispose();
                    // if changed from prior settings, do setup - ALSO check full version here just to make sure matches new cp lib version
                    const libTag:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCurlibPKG}`,'');
                    const cpVersion:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPbaseverPKG}`,'');
                    const cpVersionFull:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
                    //first make sure new cp lib version matches full version, if not error, manually update
                    if(this._cpVersion !== cpVersionFull.split('.')[0]) {
                        vscode.window.showErrorMessage(strgs.libBaseNoMatchFullVer);
                        return;
                    }
                    if(this._libTag!==libTag || this._cpVersion!==cpVersion) {
                        const ans=await vscode.window.showInformationMessage(strgs.libTagOrCPVerChgConfirm[0]+this._libTag+strgs.libTagOrCPVerChgConfirm[1]+this._cpVersion, 'Yes','No');
                        if(ans==='Yes') {
                            //save the new settings
                            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCurlibPKG}`,this._libTag,vscode.ConfigurationTarget.Workspace);
                            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCPbaseverPKG}`,this._cpVersion,vscode.ConfigurationTarget.Workspace);
                            //do the setup
                            await this.setupLibSources(); //will do the update
                        }
                    } else {
                        //await this.updateLibraries();   // **NO** will need to do full setup and update
                        await this.setupLibSources(); //will do the update
                    }
                }
                if (items[0].commandName === 'libtag') {
                    vscode.window.showInputBox({ prompt: strgs.libTagChgInputBox.prompt,placeHolder:strgs.libTagChgInputBox.placeHolder,value:this._libTag }).then(async (value) =>  {
                        if (value!==undefined && value!=='') {
                            const ans=await vscode.window.showInformationMessage(strgs.libTagChgConfirm + value, 'Yes','No');
                            if(ans==='Yes') {
                                this._libTag = value;
                                //quickPick.items[0].description = value;
                                quickPick.placeholder=strgs.updateLibNewTagQPplaceholder;
                                quickPick.items = [
                                    { label: strgs.updateLibNewTagQPItemTop.label, description: strgs.updateLibNewTagQPItemTop.description, commandName: 'update' },
                                    { label: strgs.updateLibNewTagQPItemMiddle.label, description: value, commandName: 'libtag' },
                                    { label: strgs.updateLibNewTagQPItemBottom.label, description: this._cpVersion, commandName: 'cpversion' }
                                ];                    
                                quickPick.show();
                            } else {
                                quickPick.hide();
                                quickPick.dispose();
                            }
                        } else if (value!==undefined && value===''){
                            //get the latest tag
                            const latestTag=await this.getLatestBundleTag();
                            const ans=await vscode.window.showInformationMessage(strgs.libTagLatestChgConfirm + latestTag, 'Yes','No');
                            if(ans==='Yes') {
                                this._libTag = latestTag;
                                //quickPick.items[0].description = value;
                                quickPick.placeholder="Accept to save changed settings and update libraries";
                                quickPick.items = [
                                    { label: strgs.updateLibNewTagQPItemTop.label, description: strgs.updateLibNewTagQPItemTop.description, commandName: 'update' },
                                    { label: strgs.updateLibNewTagQPItemMiddle.label, description: this._libTag, commandName: 'libtag' },
                                    { label: strgs.updateLibNewTagQPItemBottom.label, description: this._cpVersion, commandName: 'cpversion' }
                                ];                    
                                quickPick.show();
                            } else {
                                quickPick.hide();
                                quickPick.dispose();
                            }
                        }
                    });
                } else if (items[0].commandName === 'cpversion') {
                    vscode.window.showInputBox({ prompt: strgs.cpVerChgInputBox.prompt,value:this._cpVersion }).then(async (value) => {
                        if (value) {    //need to check if valid version
                            quickPick.items[1].description = value;
                            const ans=await vscode.window.showInformationMessage(strgs.cpVerChgConfirm + value, 'Yes','No');
                            if(ans==='Yes') {
                                this._cpVersion = value;
                                //quickPick.items[0].description = value;
                                quickPick.placeholder=strgs.updateCpNewVerQPplaceholder;
                                quickPick.items = [
                                    { label: strgs.updateCpNewVerQPItemTop.label, description: strgs.updateCpNewVerQPItemTop.description, commandName: 'update' },
                                    { label: strgs.updateCpNewVerQPItemMiddle.label, description: this._libTag, commandName: 'libtag' },
                                    { label: strgs.updateCpNewVerQPItemBottom.label, description: value, commandName: 'cpversion' }
                                ];                    
                                quickPick.show();
                            } else {
                                quickPick.hide();
                                quickPick.dispose();
                            }
                        }
                    });
                }
            });
            quickPick.onDidAccept(async () => { //this doesn't work, fires on all selections
                //quickPick.hide();   //refresh the quickpick and hide  
            });
            quickPick.onDidHide(() => { 
                // can't do this because of needing to bring it back up
                //quickPick.dispose();
            });
            quickPick.show();

        });
        context.subscriptions.push(updateLibCmd);

        const selectLibsCmdId=strgs.cmdSelectLibsPKG;
        const selectLibsCmd=vscode.commands.registerCommand(selectLibsCmdId, async () => {
            //first make sure ready, that is, requested version already loaded and in settings
            const ready=await this.readyForLibCmds();
            if(!ready) {
                return;
            }
            //read the metadata file
            const libMetadataPath = path.join(this._libArchiveUri.fsPath,`${strgs.libBundleFilePrefix}-${this._libTag}.json`);
            const libMetadata = JSON.parse(fs.readFileSync(libMetadataPath, 'utf8'));
            let pickItems:vscode.QuickPickItem[]=[];
            for (const lib in libMetadata) {
                pickItems.push({ label: lib, description: libMetadata[lib].version });
            }
            //filter out the current libs
            const libPath=await getLibPath();
            let libContents: [string, vscode.FileType][]=[];
            if(libPath!=='') {
                const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
                if(!wsRootFolder) {return;}
                libContents=await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(wsRootFolder.uri,libPath));
                for(const [libName, libType] of libContents) {
                    pickItems=pickItems.filter(item => item.label !== libName.replace('.mpy',''));
                }
            }
            // now do the quickpick with the pick items
            const newLibs=await vscode.window.showQuickPick(pickItems, {
                canPickMany: true,
                placeHolder: strgs.selLibQPplaceholder,
                ignoreFocusOut: true,
                title: strgs.selLibQPtitle
            });
            if(newLibs) {
                //add the new libs by passing optional parameter to the updateLibraries
                let newLibsToAdd=newLibs.map(lib => lib.label);
                newLibsToAdd=[...new Set(newLibsToAdd)]; //remove duplicates just for safety
                //and update the libraries with the new libs
                await this.updateLibraries(newLibsToAdd);
            }
        });
        context.subscriptions.push(selectLibsCmd);

        /*
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this._statusBarItem.command = 'extension.openLibraryMgmt';
        this._statusBarItem.show();
        */
    }

    /*
    public updateLibraryStatus() {
        this._statusBarItem.text = 'xxxxx';  //strgs.LIBRARY_STATUS;
    }

    private _statusBarItem: vscode.StatusBarItem;
    */

    // ** public methods **
    // **** the setup that is called after the constructor or when tag changed ****
    public async setupLibSources() {
        // ** set context key so update command is not available until setup is done
        // and start progress indicator
        //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', true);
        this.showLibUpdateProgress(strgs.setupLibProgressMsg);
        // ** this may be called by activate even if don't have workspace,
        // so need to check for workspace before doing anything
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage(strgs.setupLibNoWSError);
            this.stopLibUpdateProgress();
            return;
        }
        this._progInc=5;
        const workspaceUri = vscode.workspace.workspaceFolders[0].uri;
        // get the libtag and cp version settings
        let libTag:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCurlibPKG}`,'');
        this._libTag = libTag;
        let cpVersion:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPbaseverPKG}`,'');
        this._cpVersion = cpVersion;
        let cpVersionFull:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
        this._cpVersionFull = cpVersionFull;
        //if lib or cp version configs are not defined, set from latest and check for conflicts in cp versions
        if(this._libTag===''){
            const latestTag=await this.getLatestBundleTag();
            this._libTag=latestTag;
            libTag=this._libTag;
            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCurlibPKG}`,this._libTag,vscode.ConfigurationTarget.Workspace);
        }
        if(this._cpVersion===''){
            const latestCPTag=await this.getLatestCPTag();
            this._cpVersion=latestCPTag.split('.')[0];
            cpVersion=this._cpVersion;
            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCPbaseverPKG}`,this._cpVersion,vscode.ConfigurationTarget.Workspace);
        }
        if(this._cpVersionFull===''){
            const latestCPTag=await this.getLatestCPTag();
            this._cpVersionFull=latestCPTag;
            cpVersionFull=this._cpVersionFull;
            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCPfullverPKG}`,this._cpVersionFull,vscode.ConfigurationTarget.Workspace);
        } 
        // finally check to see if cpverion and cpfullversion match in first part
        if(this._cpVersion !== this._cpVersionFull.split('.')[0]) {
            vscode.window.showErrorMessage(strgs.libBaseNoMatchFullVer);
            //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
            this.stopLibUpdateProgress();
            return;
        }
        this._progInc=10;
        // refresh all files based on the libtag and cpversion
        const cpVersionFmt = `${cpVersion}.x-mpy`;
        // need temp space to download the zips
        const tempUriBase=this._context.globalStorageUri; //NOTE this may not initially exist
        this._tempBundlesDir = path.join(tempUriBase.fsPath, 'tempOrigBundles');
        // create the temp dir if it doesn't exist
        if (!fs.existsSync(this._tempBundlesDir)) {
            fs.mkdirSync(this._tempBundlesDir, { recursive: true });
        }
        this._progInc=15;
        // first check for lib only zips in /libArchive
        this._libArchiveUri=vscode.Uri.joinPath(workspaceUri,strgs.workspaceLibArchiveFolder);
        const libOnlyZipPyUri=vscode.Uri.joinPath(this._libArchiveUri,`${strgs.libBundleFilePrefix}-py-${libTag}-lib.zip`);
        const libOnlyZipMpyUri=vscode.Uri.joinPath(this._libArchiveUri,`${strgs.libBundleFilePrefix}-${cpVersionFmt}-${libTag}-lib.zip`);
        const pyLibFmts = ['py', cpVersionFmt];
        if(!fs.existsSync(libOnlyZipPyUri.fsPath) || !fs.existsSync(libOnlyZipMpyUri.fsPath)) {
            // get the full bundles and extract the lib folders if not there
            this._progInc+=5;
            try {
                for(const pyLibFmt of pyLibFmts) {
                    //this will check to see if already downloaded
                    await this.getOrigBundle(libTag, pyLibFmt);
                }
            } catch (error) {
                vscode.window.showErrorMessage(strgs.setupLibDnldError);
                //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
                this.stopLibUpdateProgress();
                return;
            }
            //now extract the lib folders from the full bundles and create the lib only zips
            const libOnlyZipTempDir = path.join(this._tempBundlesDir, 'libOnlyTemp');
            if (!fs.existsSync(libOnlyZipTempDir)) {
                fs.mkdirSync(libOnlyZipTempDir, { recursive: true });
            }
            for(const pyLibFmt of pyLibFmts){
                this._progInc+=5;
                const libOnlyZipFile: string = vscode.Uri.joinPath(this._libArchiveUri,`${strgs.libBundleFilePrefix}-${pyLibFmt}-${libTag}-lib.zip`).fsPath;
                const libOnlyZipSource: string = path.join(this._tempBundlesDir,`${strgs.libBundleFilePrefix}-${pyLibFmt}-${libTag}.zip`);
                const libOnlyZipArchiveName: string = `${strgs.libBundleFilePrefix}-${pyLibFmt}-${libTag}`;
                try {
                    await this.ziplibextract(libOnlyZipSource, libOnlyZipTempDir);
                    await this.ziplibzip(libOnlyZipTempDir, libOnlyZipArchiveName, libOnlyZipFile);
                    //await this.ziplibextractneeds(['adafruit_bus_device', 'adafruit_register'], libOnlyZipFile, libExtractTarget);
                } catch (error) {
                    vscode.window.showErrorMessage(strgs.setupLibExtractError);
                    //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
                    this.stopLibUpdateProgress();
                    return;
                }
                //clean up the temp dir
                fs.rmSync(libOnlyZipTempDir, { recursive: true });
                //see if we need to download the lib metadata- download checks if already downloaded
            }
            // ** ready for any lib updates
        }
        this._progInc=85;
        await this.downloadLibMetadata(libTag);
        // ** if any libs in the lib directory update them with dependencies and create stubs
        this.stopLibUpdateProgress();   // let update start another progress
        await this.updateLibraries();
        //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
    }

    // this can be called from main extension ####TBD#### should it only be called from command in this class????
    // ** optional parameter for adding new libs
    public async updateLibraries(addNewLibs?:string[]) {
        //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', true);
        this.showLibUpdateProgress(strgs.updateLibProgressMsg);   //this also sets the context
        //get the actual lib path
        const libPath=await getLibPath();
        if(libPath==='') {
            //nothing to do yet until libs are picked
            //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
            this.stopLibUpdateProgress();
            return;
        }
        this._progInc=5;
        let libNeeds: string[] = [];
        const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
        if(!wsRootFolder) {return;}
        const libContents=await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(wsRootFolder.uri,libPath));
        for(const [libName, libType] of libContents) {
            libNeeds.push(libName.replace('.mpy',''));
        }
        // ** add the new libs if any
        if(typeof addNewLibs !== 'undefined' && addNewLibs.length>0) {
            libNeeds=libNeeds.concat(addNewLibs);
            libNeeds=[...new Set(libNeeds)]; //remove duplicates just for safety
        }
        if(libNeeds.length===0) {
            vscode.window.showInformationMessage(strgs.updateLibNoLibsToUpdate);
            //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
            this.stopLibUpdateProgress();
            return;
        }
        this._progInc=10;
        // read the metadata file to pick up the dependencies
        const libMetadataPath = path.join(this._libArchiveUri.fsPath,`${strgs.libBundleFilePrefix}-${this._libTag}.json`);
        if(!fs.existsSync(libMetadataPath)) {
            vscode.window.showErrorMessage(strgs.updateLibMetadataError);
            //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
            this.stopLibUpdateProgress();
            return;
        }
        const libMetadata = JSON.parse(fs.readFileSync(libMetadataPath, 'utf8'));
        let libMetaDeps: string[] = [];
        for (const lib of libNeeds) {
            if (libMetadata[lib] && libMetadata[lib].dependencies) {
                libMetaDeps = libMetaDeps.concat(libMetadata[lib].dependencies);
            }
        }
        this._progInc=15;
        libMetaDeps=[...new Set(libMetaDeps)]; //remove duplicates
        //first the stubs, can replace the whole libstuds folder
        let libStubsNeeds = libNeeds.concat(libMetaDeps);
        libStubsNeeds=[...new Set(libStubsNeeds)]; //remove duplicates
        const libExtractTarget: string = vscode.Uri.joinPath(this._libArchiveUri,"libstubs").fsPath;
        let libOnlyZipFile: string = vscode.Uri.joinPath(this._libArchiveUri,`${strgs.libBundleFilePrefix}-py-${this._libTag}-lib.zip`).fsPath;
        try {
            await this.ziplibextractneeds(libStubsNeeds, libOnlyZipFile, libExtractTarget);
        } catch (error) {
            vscode.window.showErrorMessage(strgs.updateLibExtractStubsError);
            //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
            this.stopLibUpdateProgress();
            return;
        }
        this._progInc=30;
        //now the actual lib files- only add/update the dependencies- **NO**, have to do all libs
        const libExtractTargetLib: string = vscode.Uri.joinPath(wsRootFolder.uri,libPath).fsPath;
        const libExtractLibTemp:string = path.join(this._tempBundlesDir,"libDepsCopy");
        const cpVersionFmt = `${this._cpVersion}.x-mpy`;
        libOnlyZipFile = vscode.Uri.joinPath(this._libArchiveUri,`${strgs.libBundleFilePrefix}-${cpVersionFmt}-${this._libTag}-lib.zip`).fsPath;
        let libAllNeeds = libNeeds.concat(libMetaDeps);
        libAllNeeds=[...new Set(libAllNeeds)]; //remove duplicates
        try {
            //await this.ziplibextractneeds(libMetaDeps, libOnlyZipFile, libExtractLibTemp);
            await this.ziplibextractneeds(libAllNeeds, libOnlyZipFile, libExtractLibTemp);
        } catch (error) {
            vscode.window.showErrorMessage(strgs.updateLibExtractLibsError);
            //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
            this.stopLibUpdateProgress();
            return;
        }
        this._progInc=45;
        //now copy all from the temp dir to the target lib dir, one folder or file at a time
        const libExtractLibTempContents=await vscode.workspace.fs.readDirectory(vscode.Uri.file(libExtractLibTemp));
        for(const [libName, libType] of libExtractLibTempContents) {
            const libExtractLibTempFile=vscode.Uri.joinPath(vscode.Uri.file(libExtractLibTemp),libName);
            const libExtractTargetLibFile=vscode.Uri.joinPath(vscode.Uri.file(libExtractTargetLib),libName);
            if(libType===vscode.FileType.Directory) {
                await vscode.workspace.fs.copy(libExtractLibTempFile,libExtractTargetLibFile,{overwrite:true});
            } else {
                await vscode.workspace.fs.copy(libExtractLibTempFile,libExtractTargetLibFile,{overwrite:true});
            }
        }
        this._progInc=75;
        //clean up the temp dir
        fs.rmSync(libExtractLibTemp, { recursive: true });
        // set the libstubs in the settings for pylance
        // ######TBD##### need to check if already set and add to array
        let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get(strgs.confPyExtraPathsPKG,[]);
        extraPathsConfig=extraPathsConfig.concat([libExtractTarget]);
        extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
        await vscode.workspace.getConfiguration().update(strgs.confPyExtraPathsPKG, extraPathsConfig, vscode.ConfigurationTarget.Workspace);
        // ** done with updating the libraries
        //vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
        this.stopLibUpdateProgress();
        vscode.window.showInformationMessage(strgs.updateLibUpdatedMsg[0] + this._libTag + strgs.updateLibUpdatedMsg[1] + this._cpVersion);
    }


    // ** private properties **
    private _tempBundlesDir: string = '';
    private _context: vscode.ExtensionContext;
    private _libArchiveUri:vscode.Uri;
    private _libTag: string = '';
    private _cpVersion: string = '';
    private _cpVersionFull: string = '';
    private _progInc: number = 0;
    private _customCancelToken: vscode.CancellationTokenSource | null = null;

    // ** private methods **

    // ** check for conditions to be able to run commands
    private async readyForLibCmds(): Promise<boolean> {
        // so need to check for workspace before doing anything
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage(strgs.setupLibNoWSError);
            return false;
        }
        const workspaceUri = vscode.workspace.workspaceFolders[0].uri;
        // now the libtag and cpversions
        if(this._libTag === '' || this._cpVersion === '' || this._cpVersionFull === '') {
            vscode.window.showErrorMessage(strgs.libCmdsReadyNeedSettingsError);
            return false;
        }
        // check that the instance libtag and cpversion match settings, if not say must update first
        const libTag:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCurlibPKG}`,'');
        const cpVersion:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPbaseverPKG}`,'');
        const cpVersionFull:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
        if(this._libTag!==libTag || this._cpVersion!==cpVersion || this._cpVersionFull!==cpVersionFull) {
            vscode.window.showErrorMessage(strgs.libCmdsReadyVerChgError);
            return false;
        }
        // now the source files and metadata
        const cpVersionFmt = `${this._cpVersion}.x-mpy`;
        const libOnlyZipPyUri=vscode.Uri.joinPath(this._libArchiveUri,`${strgs.libBundleFilePrefix}-py-${this._libTag}-lib.zip`);
        const libOnlyZipMpyUri=vscode.Uri.joinPath(this._libArchiveUri,`${strgs.libBundleFilePrefix}-${cpVersionFmt}-${this._libTag}-lib.zip`);
        if(!fs.existsSync(libOnlyZipPyUri.fsPath) || !fs.existsSync(libOnlyZipMpyUri.fsPath)) {
            vscode.window.showErrorMessage(strgs.libCmdsReadyNoSourceError);
            return false;
        }
        //and finally the metadata
        const libMetadataPath = path.join(this._libArchiveUri.fsPath,`${strgs.libBundleFilePrefix}-${this._libTag}.json`);
        if(!fs.existsSync(libMetadataPath)) {
            vscode.window.showErrorMessage(strgs.libCmdsReadyNoMetadataError);
            return false;
        }
        // ** all conditions met
        return true;
    }
    // ** methods to show progress and stop with context flag

    // ** stop progress and set context flag
    private async stopLibUpdateProgress() {
        vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', false);
        this._progInc=101;
        if(this._customCancelToken){
            this._customCancelToken.cancel();
        }
    }
    // ** show progress and set context flag
    private async showLibUpdateProgress(progressMessage:string) {
        vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatinglibs', true);
        this._progInc=0;
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Library Maintenance Progress",
            cancellable: false
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the long running operation");
            });
            progress.report({ increment: 0 });
            const p = new Promise<void>(resolve => {
                const intvlId=setInterval(() => {
                    progress.report({increment:this._progInc,message:progressMessage,});
                    if(this._progInc>=100){
                        clearInterval(intvlId);
                        resolve();
                    }
                },500);
                setTimeout(() => {
                    clearInterval(intvlId);
                    resolve();
                }, 20000);	// ****** TBD ****** how to set max timeout
                //hook up the custom cancel token
                this._customCancelToken=new vscode.CancellationTokenSource();
                this._customCancelToken.token.onCancellationRequested(() => {
                    this._customCancelToken?.dispose();
                    this._customCancelToken=null;
                    clearInterval(intvlId);
                    resolve();
                });
            });
            return p;
        });
    }

    private async downloadOrigBundle(libTag: string, pyLibFmt: string): Promise<string> {
        //check to see if already downloaded
        const tmpZipPath=path.join(this._tempBundlesDir, `${strgs.libBundleFilePrefix}-${pyLibFmt}-${libTag}.zip`);
        if(fs.existsSync(tmpZipPath)) {
            console.log('File already exists:', tmpZipPath);
            return 'file already exists';
        }
        //download the file
        try {
            const response = await axios.default({
                method: 'get',
                url: `${strgs.libBundleAdafruitUrlRoot}/${libTag}/${strgs.libBundleAdafruitUrlFilePrefix}-${pyLibFmt}-${libTag}.zip`,
                responseType: 'stream'
            });
            response.data.pipe(fs.createWriteStream(tmpZipPath));
    
            return new Promise((resolve, reject) => {
                response.data.on('end', () => {
                    resolve('File downloaded successfully for fmt:' + pyLibFmt);
                });
    
                response.data.on('error', (err: any) => {
                    reject(err);
                });
            });
        } catch (error) {
            console.error('Error downloading the file:', error);
            throw error;
        }
    }
    
    private async downloadLibMetadata(libTag: string): Promise<string> {
        const dest = path.join(this._libArchiveUri.fsPath,`${strgs.libBundleFilePrefix}-${libTag}.json`);
        //check first if already downloaded
        if
        (fs.existsSync(dest)) {
            console.log('File already exists:', dest);
            return 'file already exists';
        }
        try {
            const response = await axios.default({
                method: 'get',
                url: `${strgs.libBundleAdafruitUrlRoot}/${libTag}/${strgs.libBundleAdafruitUrlFilePrefix}-${libTag}.json`,
                responseType: 'json'
            }).then((response) => {
                fs.writeFileSync(dest, JSON.stringify(response.data), {
                    encoding: "utf8",
                });
                console.log('Downloaded lib metadata to:', dest);
            });
        } catch (error) {
            console.error('Error downloading the file:', error);
            throw error;
        }
        return 'done';
    }
    
    private async getLatestBundleTag(): Promise<string> {
        let r: axios.AxiosResponse = await axios.default.get(
            "https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/latest",
            { headers: { Accept: "application/json" } }
        );
        return await r.data.tag_name;
    }
    
    private async getLatestCPTag(): Promise<string> {
        let r: axios.AxiosResponse = await axios.default.get(
            "https://github.com/adafruit/circuitpython/releases/latest",
            { headers: { Accept: "application/json" } }
        );
        return await r.data.tag_name;
    }
    
    
    private async getOrigBundle(libTag: string, pyLibFmt: string): Promise<string> {
        //    try {
        const res = await this.downloadOrigBundle(libTag, pyLibFmt);
        console.log('Downloaded orig bundle for pylibfmt: ' + pyLibFmt + ' with result:', res);
        //    } catch (error) {
        //        console.error(error);
        //    }
        return 'done';
    }
    
    private async ziplibextract(libOnlyZipSource: string, libOnlyZipTempDir: string) {
        const unzip = new zl.Unzip({
            overwrite: true,
            // Called before an item is extracted.
            onEntry: function (event) {
                if (/\/examples\//.test(event.entryName)) {
                    event.preventDefault();
                } else if (/\/requirements\//.test(event.entryName)) {
                    event.preventDefault();
                } else {
                    //console.log(event.entryCount, event.entryName);
                }
            }
        });
        //await unzip.extract("/home/stan/my-typescript-project/adafruit-circuitpython-bundle-py-20241221.zip", "/home/stan/my-typescript-project/ziplibextract/");
        await unzip.extract(libOnlyZipSource, libOnlyZipTempDir);
        // .then(function () {
        //     console.log("done");
        // }, function (err) {
        //     console.log(err);
        // });
    }
    
    private async ziplibzip(libOnlyZipTempDir: string, libOnlyZipArchiveName: string, libOnlyZipFile: string) {
        //await zl.archiveFolder("/home/stan/my-typescript-project/ziplibextract/adafruit-circuitpython-bundle-py-20241221/lib/", "/home/stan/my-typescript-project/ziplibextract/adafruit-circuitpython-bundle-py-20241221-lib.zip");
        //just zip up the lib folder in the temp
        const libOnlyZipTempDirLib = path.join(libOnlyZipTempDir, libOnlyZipArchiveName, 'lib/');
        await zl.archiveFolder(libOnlyZipTempDirLib, libOnlyZipFile);
    }
    
    private async ziplibextractneeds(libNeeds: string[], libOnlyZipFile: string, libExtractTarget: string) {
        const unzip = new zl.Unzip({
            overwrite: true,
            // Called before an item is extracted.
            onEntry: function (event) {
                if (!libNeeds.some((libName) => {
                    const rg = new RegExp(`^${libName}`);
                    return rg.test(event.entryName);
                }))    ///\/examples\//.test(event.entryName))
                {
                    event.preventDefault();
                } else {
                    //console.log(event.entryCount, event.entryName);
                }
            }
        });
        //await unzip.extract("/home/stan/my-typescript-project/ziplibextract/adafruit-circuitpython-bundle-py-20241221-lib.zip", "/home/stan/my-typescript-project/ziplibextract/libstubs/");
        await unzip.extract(libOnlyZipFile, libExtractTarget);
        // .then(function () {
        //     console.log("done");
        // }, function (err) {
        //     console.log(err);
        // });
    }
    



}
