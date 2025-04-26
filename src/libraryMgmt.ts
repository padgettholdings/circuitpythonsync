import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {getLibPath, setupStubs} from './extension';
//import { timeStamp } from 'console';

export class LibraryMgmt {
    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        const workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : vscode.Uri.file(os.homedir());
        this._libArchiveUri=vscode.Uri.joinPath(workspaceUri,strgs.workspaceLibArchiveFolder);

        // need a temp place to put the CP release json file
        const tempUriBase=this._context.globalStorageUri; //NOTE this may not initially exist
        this._tempCPReleaseDir = path.join(tempUriBase.fsPath, 'tempCPReleaseJson');
        // create the temp dir if it doesn't exist
        if (!fs.existsSync(this._tempCPReleaseDir)) {
            fs.mkdirSync(this._tempCPReleaseDir, { recursive: true });
        }


        interface cmdQuickInputButton extends QuickInputButton {
			commandName: string;
		}
		const iconCommand1:ThemeIcon=new ThemeIcon('library');

        const iconCommand2:ThemeIcon=new ThemeIcon('question');

        interface cmdQuickItem extends vscode.QuickPickItem {
            commandName: string;
        }
        this._progInc=0;    //set to greater than 100 to stop progress

        this._libUpdateVerChg=false;    //this gets set to true if either libtag or cpversion changes

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
            const helpButton:cmdQuickInputButton={
                iconPath:iconCommand2,
                tooltip:strgs.helpTooltipMap.get(strgs.helpLibrarySupport),
                commandName:"help"
            };    
            const quickPick = vscode.window.createQuickPick<cmdQuickItem>();
            quickPick.title = strgs.updateLibQPtitle;
            quickPick.buttons = [pickButton,helpButton];
            // see if there is a pending change and alter the QP if so
            if(this._libUpdateVerChg) {
                quickPick.placeholder=strgs.updateLibNewTagQPplaceholder;
                const descLibTag=(this._libTag!=='') ? this._libTag : '(LATEST)';
                const descCPVer=(this._cpVersion!=='') ? this._cpVersion : '(LATEST)';
                quickPick.items = [
                    { label: strgs.updateLibNewTagQPItemTop.label, description: strgs.updateLibNewTagQPItemTop.description, commandName: 'update' },
                    { label: strgs.updateLibNewTagQPItemMiddle.label, description: descLibTag, commandName: 'libtag' },
                    { label: strgs.updateLibNewTagQPItemBottom.label, description: descCPVer, commandName: 'cpversion' }
                ];
            } else {
                quickPick.placeholder = strgs.updateLibQPSelPlaceholder;
                const descLibTag=(this._libTag!=='') ? this._libTag : '(LATEST)';
                const descCPVer=(this._cpVersion!=='') ? this._cpVersion : '(LATEST)';
                quickPick.items = [
                    { label: strgs.updateLibQPItemTop.label, description: strgs.updateLibQPItemTop.description, commandName: 'update' },
                    { label: strgs.updateLibQPItemMiddle.label, description: descLibTag, commandName: 'libtag' },
                    { label: strgs.updateLibQPItemBottom.label, description: descCPVer, commandName: 'cpversion' }
                ];
            }
            // ** #64, save copy of placeholder and items so can reset if ESC
            //let origPlaceholder=quickPick.placeholder;
            //let origItems=quickPick.items;
            //
            quickPick.onDidTriggerButton((button) => {  
                const btn=button as cmdQuickInputButton;
                if (btn.commandName === 'selectLibs') {
                    quickPick.hide();
                    quickPick.dispose();
                    vscode.commands.executeCommand(strgs.cmdSelectLibsPKG);
                } else if (btn.commandName === 'help') {
                    quickPick.hide();
                    quickPick.dispose();
                    // show the help page
                    vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibrarySupport);
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
                    // ** in the case where a new project was created and the settings are all blank in the settings.json,
                    // need to call the setupLibSources to get the settings and do the setup
                    if(libTag==='' || cpVersion==='' || cpVersionFull==='') {
                        // #64, need to take into account that the _libtag and _cpversion may have changed in the UI
                        //  so save them to the settings if so, not really a version change since nothing was there.
                        if(this._libTag!=='') {
                            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCurlibPKG}`,this._libTag,vscode.ConfigurationTarget.Workspace);
                        }
                        if(this._cpVersion!=='') {
                            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCPbaseverPKG}`,this._cpVersion,vscode.ConfigurationTarget.Workspace);
                        }
                        try {
                            await this.setupLibSources();
                            this._libUpdateVerChg=false;
                            // ** #68, try to do the stubs if no stubs archive
                            await setupStubs(true);
                        } catch (error) {
                            //report the error but continue, will get out
                            vscode.window.showErrorMessage(strgs.setupLibGeneralError+this.getErrorMessage(error));
                            this.stopLibUpdateProgress();
                        }
                        return;
                    }
                    //first make sure new cp lib version matches full version, if not error, manually update
                    if(this._cpVersion !== cpVersionFull.split('.')[0]) {
                        vscode.window.showErrorMessage(strgs.libBaseNoMatchFullVer);
                        return;
                    }
                    if(this._libTag!==libTag || this._cpVersion!==cpVersion) {
                        const ans=await vscode.window.showInformationMessage(strgs.libTagOrCPVerChgConfirm[0]+this._libTag+strgs.libTagOrCPVerChgConfirm[1]+this._cpVersion, 'Yes','No',"Help");
                        if(ans==='Yes') {
                            //save the new settings
                            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCurlibPKG}`,this._libTag,vscode.ConfigurationTarget.Workspace);
                            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCPbaseverPKG}`,this._cpVersion,vscode.ConfigurationTarget.Workspace);
                            //do the setup
                            try {
                                await this.setupLibSources(); //will do the update
                                this._libUpdateVerChg=false;
                                // ** #68, try to do the stubs if no stubs archive
                                await setupStubs(true);
                            } catch (error) {
                                //report the error but continue, will get out
                                vscode.window.showErrorMessage(strgs.setupLibGeneralError+this.getErrorMessage(error));
                                this.stopLibUpdateProgress();
                            }
                        } else if(ans==='Help'){
                            // show the help page
                            vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibrarySupport);
                            return;
                        }
                    } else {
                        //await this.updateLibraries();   // **NO** will need to do full setup and update
                        try {
                            await this.setupLibSources(); //will do the update
                            this._libUpdateVerChg=false;
                            // ** #68, try to do the stubs if no stubs archive
                            await setupStubs(true);
                        } catch (error) {
                            //report the error but continue, will get out
                            vscode.window.showErrorMessage(strgs.setupLibGeneralError+this.getErrorMessage(error));	
                            this.stopLibUpdateProgress();			                            
                        }
                    }
                }
                if (items[0].commandName === 'libtag') {
                    vscode.window.showInputBox({ prompt: strgs.libTagChgInputBox.prompt,placeHolder:strgs.libTagChgInputBox.placeHolder,value:this._libTag }).then(async (value) =>  {
                        if (value!==undefined && value!=='') {
                            // skip if same as current and use original prompt in QP, still have to rebuild
                            if(value===this._libTag  && !this._libUpdateVerChg) {
                                quickPick.placeholder=strgs.updateLibQPSelPlaceholder;
                                const descCPVer=(this._cpVersion!=='') ? this._cpVersion : '(LATEST)';
                                quickPick.items = [
                                    { label: strgs.updateLibQPItemTop.label, description: strgs.updateLibQPItemTop.description, commandName: 'update' },
                                    { label: strgs.updateLibQPItemMiddle.label, description: this._libTag, commandName: 'libtag' },
                                    { label: strgs.updateLibQPItemBottom.label, description: descCPVer, commandName: 'cpversion' }
                                ];                    
                                quickPick.show();
                            } else {
                                const ans=await vscode.window.showInformationMessage(strgs.libTagChgConfirm + value, 'Yes','No');
                                if(ans==='Yes') {
                                    this._libTag = value;
                                    this._libUpdateVerChg=true;
                                    //quickPick.items[0].description = value;
                                    quickPick.placeholder=strgs.updateLibNewTagQPplaceholder;
                                    const descCPVer=(this._cpVersion!=='') ? this._cpVersion : '(LATEST)';
                                    quickPick.items = [
                                        { label: strgs.updateLibNewTagQPItemTop.label, description: strgs.updateLibNewTagQPItemTop.description, commandName: 'update' },
                                        { label: strgs.updateLibNewTagQPItemMiddle.label, description: value, commandName: 'libtag' },
                                        { label: strgs.updateLibNewTagQPItemBottom.label, description: descCPVer, commandName: 'cpversion' }
                                    ];                    
                                    quickPick.show();
                                } else {
                                    quickPick.hide();
                                    quickPick.dispose();
                                }
                            }
                        } else if (value!==undefined && value===''){
                            //get the latest tag
                            const latestTag=await this.getLatestBundleTag();
                            if(latestTag===this._libTag &&  !this._libUpdateVerChg){
                                quickPick.placeholder=strgs.updateLibQPSelPlaceholder;
                                const descCPVer=(this._cpVersion!=='') ? this._cpVersion : '(LATEST)';
                                quickPick.items = [
                                    { label: strgs.updateLibQPItemTop.label, description: strgs.updateLibQPItemTop.description, commandName: 'update' },
                                    { label: strgs.updateLibQPItemMiddle.label, description: this._libTag, commandName: 'libtag' },
                                    { label: strgs.updateLibQPItemBottom.label, description: descCPVer, commandName: 'cpversion' }
                                ];                    
                                quickPick.show();
                            } else {
                                const ans=await vscode.window.showInformationMessage(strgs.libTagLatestChgConfirm + latestTag, 'Yes','No');
                                if(ans==='Yes') {
                                    this._libTag = latestTag;
                                    this._libUpdateVerChg=true;
                                    //quickPick.items[0].description = value;
                                    quickPick.placeholder=strgs.updateLibNewTagQPplaceholder;
                                    const descCPVer=(this._cpVersion!=='') ? this._cpVersion : '(LATEST)';
                                    quickPick.items = [
                                        { label: strgs.updateLibNewTagQPItemTop.label, description: strgs.updateLibNewTagQPItemTop.description, commandName: 'update' },
                                        { label: strgs.updateLibNewTagQPItemMiddle.label, description: this._libTag, commandName: 'libtag' },
                                        { label: strgs.updateLibNewTagQPItemBottom.label, description: descCPVer, commandName: 'cpversion' }
                                    ];                    
                                    quickPick.show();
                                } else {
                                    quickPick.hide();
                                    quickPick.dispose();
                                }
                            }
                        } else if (value===undefined) {
                            //if ESC just get back to the QP
                            // have to reset the references
                            quickPick.placeholder=quickPick.placeholder;
                            quickPick.items = quickPick.items;
                            quickPick.show();
                        }
                    });
                } else if (items[0].commandName === 'cpversion') {
                    vscode.window.showInputBox({ prompt: strgs.cpVerChgInputBox.prompt,value:this._cpVersion }).then(async (value) => {
                        if (value) {    //need to check if valid version
                            //quickPick.items[1].description = value;
                            //check to see if changed
                            if(value===this._cpVersion && !this._libUpdateVerChg) {
                                quickPick.placeholder=strgs.updateLibQPSelPlaceholder;
                                const descLibTag=(this._libTag!=='') ? this._libTag : '(LATEST)';
                                quickPick.items = [
                                    { label: strgs.updateLibQPItemTop.label, description: strgs.updateLibQPItemTop.description, commandName: 'update' },
                                    { label: strgs.updateLibQPItemMiddle.label, description: descLibTag, commandName: 'libtag' },
                                    { label: strgs.updateLibQPItemBottom.label, description: this._cpVersion, commandName: 'cpversion' }
                                ];
                                quickPick.show();
                            } else {
                                const ans=await vscode.window.showInformationMessage(strgs.cpVerChgConfirm + value, 'Yes','No');
                                if(ans==='Yes') {
                                    this._cpVersion = value;
                                    this._libUpdateVerChg=true;
                                    //quickPick.items[0].description = value;
                                    quickPick.placeholder=strgs.updateCpNewVerQPplaceholder;
                                    const descLibTag=(this._libTag!=='') ? this._libTag : '(LATEST)';
                                    quickPick.items = [
                                        { label: strgs.updateCpNewVerQPItemTop.label, description: strgs.updateCpNewVerQPItemTop.description, commandName: 'update' },
                                        { label: strgs.updateCpNewVerQPItemMiddle.label, description: descLibTag, commandName: 'libtag' },
                                        { label: strgs.updateCpNewVerQPItemBottom.label, description: value, commandName: 'cpversion' }
                                    ];                    
                                    quickPick.show();
                                } else {
                                    quickPick.hide();
                                    quickPick.dispose();
                                }
                            }
                        } else if (value!==undefined && value===''){
                            // #####TEST##### try to get latest full version file
                            // use simple date tag as cache key
                            const currentDTtag=new Date().toISOString().split('T')[0].replace(/[^0-9]/g,'');
                            //####TBD#### compare filename in cache dir with currentDTtag, if not match delete it and ...
                            // get the latest release file
                            const releaseFile=path.join(this._tempCPReleaseDir,currentDTtag+'.json');
                            try {
                                await this.getCPreleaseJson(releaseFile);
                            } catch (error) {
                                vscode.window.showErrorMessage('error getting cp release json: '+this.getErrorMessage(error));
                                return;
                            }
                            //and just go back to the QP
                            quickPick.placeholder=quickPick.placeholder;
                            quickPick.items = quickPick.items;
                            quickPick.show();                            
                        } else if (value===undefined) {
                            //if ESC just get back to the QP
                            // have to reset the references
                            quickPick.placeholder=quickPick.placeholder;
                            quickPick.items = quickPick.items;
                            quickPick.show();
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
            // ** shortcut out with info msg if lib folder doesn't yet exist
            // ** #71, offer to make folder if it doesn't exist
            let libPath=await getLibPath();
            if(libPath==='') {
                const ans=await vscode.window.showInformationMessage(strgs.selLibsNoLibFolder, 'Yes','No');
                if(ans==='Yes') {
                    //create the lib folder
                    const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
                    if(!wsRootFolder) {return;}
                    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(wsRootFolder.uri,'lib'));
                    libPath=await getLibPath();
                }else {
                    return;
                }
            }
            //read the metadata file
            const libMetadataPath = path.join(this._libArchiveUri.fsPath,`${strgs.libBundleFilePrefix}-${this._libTag}.json`);
            const libMetadata = JSON.parse(fs.readFileSync(libMetadataPath, 'utf8'));
            let pickItems:vscode.QuickPickItem[]=[];
            for (const lib in libMetadata) {
                pickItems.push({ label: lib, description: libMetadata[lib].version });
            }
            //filter out the current libs
            // ** #95, will add them back at top, keep libContents for later possible delete
            let libContents: [string, vscode.FileType][]=[];
            if(libPath!=='') {
                const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
                if(!wsRootFolder) {return;}
                libContents=await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(wsRootFolder.uri,libPath));
                for(const [libName, libType] of libContents) {
                    pickItems=pickItems.filter(item => item.label !== libName.replace('.mpy',''));
                }
            }
            // #95, add current libs back to the top of the list
            for(const [libName, libType] of libContents) {
                const libNameNoExt=libName.replace('.mpy','');
                let libNameVer= "unknown";
                if (libNameNoExt in libMetadata) {libNameVer= libMetadata[libNameNoExt].version;}
                pickItems.unshift({ label: libNameNoExt, description: libNameVer,picked:true });
            }
            // ** #72, change to createQuickPick for help button
            const helpButton:cmdQuickInputButton={
                iconPath:iconCommand2,
                tooltip:strgs.helpTooltipMap.get(strgs.helpLibrarySupport),
                commandName:'help'
            };
            const qpLibSelLibs = vscode.window.createQuickPick();
            qpLibSelLibs.title = strgs.selLibQPtitle;
            qpLibSelLibs.buttons = [helpButton];
            qpLibSelLibs.canSelectMany = true;
            qpLibSelLibs.placeholder = strgs.selLibQPplaceholder;
            qpLibSelLibs.ignoreFocusOut = true;
            qpLibSelLibs.items = pickItems;
            qpLibSelLibs.selectedItems = pickItems.filter(item => item.picked);
            // now do the quickpick with the pick items
            // const newLibs=await vscode.window.showQuickPick(pickItems, {
            //     canPickMany: true,
            //     placeHolder: strgs.selLibQPplaceholder,
            //     ignoreFocusOut: true,
            //     title: strgs.selLibQPtitle
            // });
            qpLibSelLibs.onDidTriggerButton((button) => {  
                const btn=button as cmdQuickInputButton;
                if (btn.commandName === 'help') {
                    qpLibSelLibs.hide();
                    // show the help page
                    vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibrarySupport);
                }
            }); 	
            qpLibSelLibs.onDidAccept(async () => {
                const newLibs=qpLibSelLibs.selectedItems;
                if(newLibs===undefined) {
                    qpLibSelLibs.hide();
                    return;
                }       // if esc just bail.  none selected is length 0
                // #95, split into five steps:
                //  - check to see if all current libs were deleted, if so warn
                //  - generate string array of new adds that may include current or is empty
                //  - if any current libs are unselected, delete them from lib folder using string array
                //  - **NO- pass in case remove deps ** remove remaining current libs from new adds since already in lib folder and dependencies will be removed
                //  - if any remaining plus new pass to updateLibraries
                let newLibsToAdd:string[]=[];
                if(newLibs && newLibs.length>0) {
                    newLibsToAdd=newLibs.map(lib => lib.label);
                    newLibsToAdd=[...new Set(newLibsToAdd)]; //remove duplicates just for safety
                }
                if(libContents.length>0 && !libContents.some(([libName,libType]) => {
                    return newLibsToAdd.some(lib => lib.replace('.mpy','') === libName.replace('.mpy',''));
                })){
                    const ans=await vscode.window.showWarningMessage(strgs.selLibAllCurLibsDel, 'Yes','No');
                    if(ans!=='Yes') {
                        qpLibSelLibs.hide();
                        return;
                    }
                }
                const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
                if(!wsRootFolder) {
                    qpLibSelLibs.hide();
                    return;
                }
                for(const [libName, libType] of libContents) {
                    const libNameNoExt=libName.replace('.mpy','');
                    if(!newLibsToAdd.some(item => item === libNameNoExt)) {
                        const libFileUri=vscode.Uri.joinPath(wsRootFolder.uri,libPath,libName);
                        try {
                            if(libType===vscode.FileType.Directory) {
                                await vscode.workspace.fs.delete(libFileUri,{recursive:true});
                            } else {
                                await vscode.workspace.fs.delete(libFileUri);
                            }
                        } catch (error) {
                            vscode.window.showErrorMessage(strgs.selLibDelLibError+this.getErrorMessage(error));
                        }
                    } else {
                    // since not there remove current lib from newLibsToAdd
                        //newLibsToAdd=newLibsToAdd.filter(lib => lib !== libNameNoExt);
                    }
                }
                // ** #95, will always need to call updateLibraries, even if just to clear stubs
                if(true) {        //if(newLibsToAdd.length>0) {
                    //add the new libs by passing optional parameter to the updateLibraries
                    //and update the libraries with the new libs
                    try {
                        await this.updateLibraries(newLibsToAdd);
                    } catch (error) {
                        //report the error, will get out
                        vscode.window.showErrorMessage(strgs.updateLibGeneralError+this.getErrorMessage(error));
                        this.stopLibUpdateProgress();
                    }
                }
                qpLibSelLibs.hide();
            });
            qpLibSelLibs.onDidHide(() => { 
                qpLibSelLibs.dispose();
            });
            qpLibSelLibs.show();
        });
        context.subscriptions.push(selectLibsCmd);

        // ** #71, reset global lib tag and cp ver vars if config changes
        // NOTE that the full version is not used here, only the tag and base version
        vscode.workspace.onDidChangeConfiguration((e) => {  
            if(e.affectsConfiguration(`circuitpythonsync.${strgs.confCurlibPKG}`) || 
                    e.affectsConfiguration(`circuitpythonsync.${strgs.confCPbaseverPKG}`) ) {
                const confCurlibPKG = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCurlibPKG}`,'');
                const confCPbaseverPKG = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPbaseverPKG}`, '');
                //const confCPfullverPKG = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`, '');
                // handle two conditions:
                // - if the configs are blank, set the instances to blank
                // - if the configs are different from the instance, swap and set the version chg flag, 
                //      THEN run the lib install
                if(confCurlibPKG === '' && confCPbaseverPKG === '' ) {
                    this._libTag='';
                    this._cpVersion='';
                    //this._cpVersionFull='';
                    this._libUpdateVerChg=false;  //reset flag so setup will run
                    return;     //get out because likely config is gone
                }
                if(this._libTag!==confCurlibPKG || this._cpVersion!==confCPbaseverPKG ) {
                    this._libTag=confCurlibPKG;
                    this._cpVersion=confCPbaseverPKG;
                    //this._cpVersionFull=confCPfullverPKG;
                    this._libUpdateVerChg=true;  //set flag to true so update will do setup
                    // now run the setup to update the libraries
                    vscode.commands.executeCommand(strgs.cmdLibUpdatePKG);
                }
            }
        });
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
    // ** need a public method to set the instance vars for libtag, cpversion, and cpfullversion
    public setLibCPtagVers():[string,string,string] {
        let libTag:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCurlibPKG}`,'');
        this._libTag = libTag;
        let cpVersion:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPbaseverPKG}`,'');
        this._cpVersion = cpVersion;
        let cpVersionFull:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
        this._cpVersionFull = cpVersionFull;
        return [libTag,cpVersion,cpVersionFull];
    }

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
        // just call the helper above
        let [libTag,cpVersion,cpVersionFull]=this.setLibCPtagVers();
        // let libTag:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCurlibPKG}`,'');
        // this._libTag = libTag;
        // let cpVersion:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPbaseverPKG}`,'');
        // this._cpVersion = cpVersion;
        // let cpVersionFull:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
        // this._cpVersionFull = cpVersionFull;
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

        // also need a temp place to put the CP release json file
        // this._tempCPReleaseDir = path.join(tempUriBase.fsPath, 'tempCPReleaseJson');
        // // create the temp dir if it doesn't exist
        // if (!fs.existsSync(this._tempCPReleaseDir)) {
        //     fs.mkdirSync(this._tempCPReleaseDir, { recursive: true });
        // }

        // #67 cleanup temp orig bundles
        // NOTE: uses URI methods to avoid any platform issues
        await this.cleanupTempBundles(Number(strgs.libBundleZipTempFilesToKeep));

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
        try {
            await this.updateLibraries();
        } catch (error) {
            //report the error, will get out
            vscode.window.showErrorMessage(strgs.updateLibGeneralError+this.getErrorMessage(error));
            this.stopLibUpdateProgress();
        }
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
            // #95, if no libs at all, get rid of the libstubs folder
            const libStubsUri = vscode.Uri.joinPath(this._libArchiveUri,"libstubs");
            if(fs.existsSync(libStubsUri.fsPath)) {
                vscode.workspace.fs.delete(libStubsUri,{recursive:true});
            }
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

    // ** provide access to libarchive folder exists as a way to see if installed
    public libArchiveExists():boolean {
        return fs.existsSync(this._libArchiveUri.fsPath);
    }


    // ** private properties **
    private _tempBundlesDir: string = '';
    private _tempCPReleaseDir: string = '';
    private _context: vscode.ExtensionContext;
    private _libArchiveUri:vscode.Uri;
    private _libTag: string = '';
    private _cpVersion: string = '';
    private _cpVersionFull: string = '';
    private _progInc: number = 0;
    private _customCancelToken: vscode.CancellationTokenSource | null = null;
    private _libUpdateVerChg: boolean = false;

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
    public async stopLibUpdateProgress() {
        vscode.commands.executeCommand('setContext', strgs.libUpdatingContextKeyPKG, false);
        this._progInc=101;
        if(this._customCancelToken){
            this._customCancelToken.cancel();
        }
    }
    // ** show progress and set context flag
    private async showLibUpdateProgress(progressMessage:string) {
        vscode.commands.executeCommand('setContext', strgs.libUpdatingContextKeyPKG, true);
        this._progInc=0;
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: strgs.updateLibProgressTitle,
            cancellable: false
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log(strgs.updateLibProgressCancelLog);
                vscode.commands.executeCommand('setContext', strgs.libUpdatingContextKeyPKG, false);
            });
            progress.report({ increment: 0 });
            const p = new Promise<void>(resolve => {
                const intvlId=setInterval(() => {
                    progress.report({increment:this._progInc,message:progressMessage,});
                    if(this._progInc>=100){
                        clearInterval(intvlId);
                        vscode.commands.executeCommand('setContext', strgs.libUpdatingContextKeyPKG, false);
                        resolve();
                    }
                },500);
                setTimeout(() => {
                    clearInterval(intvlId);
                    vscode.commands.executeCommand('setContext', strgs.libUpdatingContextKeyPKG, false);
                    resolve();
                }, 20000);	// ****** TBD ****** how to set max timeout
                //hook up the custom cancel token
                this._customCancelToken=new vscode.CancellationTokenSource();
                this._customCancelToken.token.onCancellationRequested(() => {
                    this._customCancelToken?.dispose();
                    this._customCancelToken=null;
                    clearInterval(intvlId);
                    vscode.commands.executeCommand('setContext', strgs.libUpdatingContextKeyPKG, false);
                    resolve();
                });
            });
            return p;
        });
    }

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

    private async downloadOrigBundle(libTag: string, pyLibFmt: string): Promise<string> {
        //check to see if already downloaded
        const tmpZipPath=path.join(this._tempBundlesDir, `${strgs.libBundleFilePrefix}-${pyLibFmt}-${libTag}.zip`);
        if(fs.existsSync(tmpZipPath)) {
            console.log(strgs.libDnldBundleExistsLog, tmpZipPath);
            return strgs.libDnldBundleExistsRtn;
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
                    resolve(strgs.libDnldBundleSuccessRtn + pyLibFmt);
                });
    
                response.data.on('error', (err: any) => {
                    reject(err);
                });
            });
        } catch (error) {
            console.error(strgs.libDnldBundleErrorMsg, error);
            throw error;
        }
    }
    
    private async downloadLibMetadata(libTag: string): Promise<string> {
        const dest = path.join(this._libArchiveUri.fsPath,`${strgs.libBundleFilePrefix}-${libTag}.json`);
        //check first if already downloaded
        if
        (fs.existsSync(dest)) {
            console.log(strgs.libDnldMetadataExistsLog, dest);
            return strgs.libDnldMetadataExistsRtn;
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
                console.log(strgs.libDnldMetadataSuccessLog, dest);
            });
        } catch (error) {
            console.error(strgs.libDnldMetadataErrorLog, error);
            throw error;
        }
        return 'done';
    }
    
    private async getLatestBundleTag(): Promise<string> {
        let r: axios.AxiosResponse = await axios.default.get(
            strgs.libBundleAdafruitUrlLatest,
            { headers: { Accept: "application/json" } }
        );
        return await r.data.tag_name;
    }
    
    private async getLatestCPTag(): Promise<string> {
        let r: axios.AxiosResponse = await axios.default.get(
            strgs.libCPAdafruitUrlLatest,
            { headers: { Accept: "application/json" } }
        );
        return await r.data.tag_name;
    }
    
    private async getCPreleaseJson(cacheDest:string): Promise<string> {
        try {
            const response = await axios.default.get(
                'https://api.github.com/repos/adafruit/circuitpython/releases',
                { 
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28"
                    },
                    responseType: 'json'
                }
            ).then((response) => {
                fs.writeFileSync(cacheDest, JSON.stringify(response.data), {
                    encoding: "utf8",
                });
                console.log(strgs.stubsPyPiMetadataDnldLog, cacheDest);
            });
        } catch (error) {
            console.error(strgs.stubsPyPiMetadataDnldErrorLog, error);
            throw error;
        }
        return 'done';
    }
    
    private async getOrigBundle(libTag: string, pyLibFmt: string): Promise<string> {
        //    try {
        const res = await this.downloadOrigBundle(libTag, pyLibFmt);
        console.log(strgs.getOrigBundleLog[0] + pyLibFmt + strgs.getOrigBundleLog[1], res);
        //    } catch (error) {
        //        console.error(error);
        //    }
        return 'done';
    }


    private async cleanupTempBundles(numFilesToKeep: number) {
        interface dirListWDateTag {
            file:string,
            type:vscode.FileType,
            mtime:number
        }
        //
        // use URI methods to avoid any platform issues
        const tempBundlesDirUri=vscode.Uri.file(this._tempBundlesDir);
        const tempOrigBundlesDirContents=await vscode.workspace.fs.readDirectory(tempBundlesDirUri);
        let dirContentsWDate: dirListWDateTag[] = Array<dirListWDateTag>(0);
        for(const [file, type] of tempOrigBundlesDirContents) {
            if(type===vscode.FileType.File) {
            const fileStat=await vscode.workspace.fs.stat(vscode.Uri.joinPath(tempBundlesDirUri,file));
            dirContentsWDate.push({file:file,type:type,mtime:fileStat.mtime});
            }
        }
        // if less than or equal to numFilesToKeep (*2, one of each py type), return
        if(dirContentsWDate.length<=2*numFilesToKeep) {
            return;
        }
        // sort by date ascending so have oldest first
        dirContentsWDate.sort((a,b) => a.mtime-b.mtime);
        // remove the oldest files
        let fileToDelete:vscode.Uri;
        for(let i=0; i<dirContentsWDate.length-2*numFilesToKeep; i++) {
            fileToDelete=vscode.Uri.joinPath(tempBundlesDirUri,dirContentsWDate[i].file);
            await vscode.workspace.fs.delete(fileToDelete);
        }
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
                    const rg = new RegExp(`^${libName}(\.py|\.mpy)?$|^${libName}[\\/]+`);
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
