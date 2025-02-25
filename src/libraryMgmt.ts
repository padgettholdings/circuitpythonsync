import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings.js';
import * as axios from 'axios';
import * as zl from 'zip-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {getLibPath} from './extension.js';

export class LibraryMgmt {
    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        const workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : vscode.Uri.file(os.homedir());
        this._libArchiveUri=vscode.Uri.joinPath(workspaceUri,'libArchive');

        interface cmdQuickInputButton extends QuickInputButton {
			commandName: string;
		}
		const iconCommand1:ThemeIcon=new ThemeIcon('gear');

        interface cmdQuickItem extends vscode.QuickPickItem {
            commandName: string;
        }

        const updateLibCmd=vscode.commands.registerCommand('circuitpythonsync.libupdate', async () => {
            //do quick input to show the libtag and cpversion and allow to change
            const pickButton:cmdQuickInputButton={
                iconPath:iconCommand1,
                tooltip:"testtest",
                commandName:"command1"
            };    
            const quickPick = vscode.window.createQuickPick<cmdQuickItem>();
            quickPick.title = 'Update Libraries';
            quickPick.buttons = [pickButton];
            quickPick.placeholder = 'Accept or change the library tag and CircuitPython version';
            quickPick.items = [
                { label: 'Enter or click here to update with current settings', description: 'Or click library tag or CP version to change', commandName: 'update' },
                { label: 'Library Tag', description: this._libTag, commandName: 'libtag' },
                { label: 'CircuitPython Version', description: this._cpVersion, commandName: 'cpversion' }
            ];
            // quickPick.buttons = [
            //     {
            //         iconPath: iconCommand1,
            //         tooltip: 'Change the library tag and CircuitPython version'
            //     }
            // ];
            quickPick.onDidTriggerButton((button) => {  
                const btn=button as cmdQuickInputButton;
                if (btn.commandName === 'libtag') {
                    vscode.window.showInputBox({ prompt: 'Enter the library tag' }).then((value) => {
                        if (value) {
                            this._libTag = value;
                            quickPick.items[0].description = value;
                            
                            //quickPick.show();   //refresh the quickpick
                        }
                    });
                } else if (btn.commandName === 'cpversion') {
                    vscode.window.showInputBox({ prompt: 'Enter the CircuitPython version' }).then((value) => {
                        if (value) {
                            this._cpVersion = value;
                            quickPick.items[1].description = value;
                            //quickPick.show();   //refresh the quickpick
                        }
                    });
                }
            });
            quickPick.onDidChangeSelection(async (items) => {
                if(items[0].commandName==='update') {
                    quickPick.hide();
                    // ####TBD#### if changed from prior settings, do setup
                    //this.updateLibraries();
                }
                if (items[0].commandName === 'libtag') {
                    vscode.window.showInputBox({ prompt: 'Enter the library tag' }).then(async (value) =>  {
                        if (value) {
                            const ans=await vscode.window.showInformationMessage('Are you sure you want Library tag changed to: ' + value, 'Yes','No');
                            if(ans==='Yes') {
                                this._libTag = value;
                                //quickPick.items[0].description = value;
                                quickPick.items = [
                                    { label: 'Enter or click here to update with current settings', description: 'Or click library tag or CP version to change', commandName: 'update' },
                                    { label: 'Library Tag', description: value, commandName: 'libtag' },
                                    { label: 'CircuitPython Version', description: this._cpVersion, commandName: 'cpversion' }
                                ];                    
                                quickPick.show();
                            } else {
                                quickPick.hide();
                            }
                            //quickPick.show();   //refresh the quickpick
                        }
                    });
                } else if (items[0].commandName === 'cpversion') {
                    vscode.window.showInputBox({ prompt: 'Enter the CircuitPython version' }).then(async (value) => {
                        if (value) {    //need to check if valid version
                            quickPick.items[1].description = value;
                            const ans=await vscode.window.showInformationMessage('Are you sure you want CP version  changed to: ' + value, 'Yes','No');
                            if(ans==='Yes') {
                                this._cpVersion = value;
                                //quickPick.items[0].description = value;
                                quickPick.items = [
                                    { label: 'Enter or click here to update with current settings', description: 'Or click library tag or CP version to change', commandName: 'update' },
                                    { label: 'Library Tag', description: this._libTag, commandName: 'libtag' },
                                    { label: 'CircuitPython Version', description: value, commandName: 'cpversion' }
                                ];                    
                                quickPick.show();
                            } else {
                                quickPick.hide();
                            }

                            //quickPick.show();   //refresh the quickpick
                        }
                    });
                }
            });
            quickPick.onDidAccept(async () => { //need to check if valid version    //need to check if valid version
                //quickPick.hide();   //refresh the quickpick and hide  
                
                


            });
            quickPick.onDidHide(() => { 
                //quickPick.dispose();
            });
            quickPick.show();

            //await this.updateLibraries();
        });
        context.subscriptions.push(updateLibCmd);

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
    public async setup() {
        // ** this may be called by activate even if don't have workspace,
        // so need to check for workspace before doing anything
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('No workspace is open, cannot init library management');
            return;
        }
        const workspaceUri = vscode.workspace.workspaceFolders[0].uri;
        // get the libtag and cp version settings
        const libTag:string = vscode.workspace.getConfiguration().get('circuitpythonsync.curlibtag','');
        this._libTag = libTag;
        const cpVersion:string = vscode.workspace.getConfiguration().get('circuitpythonsync.cpbaseversion','');
        this._cpVersion = cpVersion;
        //if configs are not defined, ###TBD###
        if(libTag === '' || cpVersion === '') {
            vscode.window.showErrorMessage('Please set the library tag and CircuitPython version in the settings');
            return;
        }
        // refresh all files based on the libtag and cpversion
        const cpVersionFmt = `${cpVersion}.x-mpy`;
        // need temp space to download the zips
        const tempUriBase=this._context.globalStorageUri; //NOTE this may not initially exist
        this._tempBundlesDir = path.join(tempUriBase.fsPath, 'tempOrigBundles');
        // create the temp dir if it doesn't exist
        if (!fs.existsSync(this._tempBundlesDir)) {
            fs.mkdirSync(this._tempBundlesDir, { recursive: true });
        }
        // first check for lib only zips in /libArchive
        this._libArchiveUri=vscode.Uri.joinPath(workspaceUri,'libArchive');
        const libOnlyZipPyUri=vscode.Uri.joinPath(this._libArchiveUri,`adafruit-circuitpython-bundle-py-${libTag}-lib.zip`);
        const libOnlyZipMpyUri=vscode.Uri.joinPath(this._libArchiveUri,`adafruit-circuitpython-bundle-${cpVersionFmt}-${libTag}-lib.zip`);
        const pyLibFmts = ['py', cpVersionFmt];
        if(!fs.existsSync(libOnlyZipPyUri.fsPath) || !fs.existsSync(libOnlyZipMpyUri.fsPath)) {
            // get the full bundles and extract the lib folders if not there
            try {
                for(const pyLibFmt of pyLibFmts) {
                    //this will check to see if already downloaded
                    await this.getOrigBundle(libTag, pyLibFmt);
                }
            } catch (error) {
                vscode.window.showErrorMessage('Error downloading the original lib bundle zip files');
                return;
            }
            //now extract the lib folders from the full bundles and create the lib only zips
            const libOnlyZipTempDir = path.join(this._tempBundlesDir, 'libOnlyTemp');
            if (!fs.existsSync(libOnlyZipTempDir)) {
                fs.mkdirSync(libOnlyZipTempDir, { recursive: true });
            }
            for(const pyLibFmt of pyLibFmts){
                const libOnlyZipFile: string = vscode.Uri.joinPath(this._libArchiveUri,`adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}-lib.zip`).fsPath;
                const libOnlyZipSource: string = path.join(this._tempBundlesDir,`adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}.zip`);
                const libOnlyZipArchiveName: string = `adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}`;
                try {
                    await this.ziplibextract(libOnlyZipSource, libOnlyZipTempDir);
                    await this.ziplibzip(libOnlyZipTempDir, libOnlyZipArchiveName, libOnlyZipFile);
                    //await this.ziplibextractneeds(['adafruit_bus_device', 'adafruit_register'], libOnlyZipFile, libExtractTarget);
                } catch (error) {
                    vscode.window.showErrorMessage('Error extracting the lib folders from the original bundle zip files');
                    return;
                }
                //clean up the temp dir
                fs.rmSync(libOnlyZipTempDir, { recursive: true });
                //see if we need to download the lib metadata- download checks if already downloaded
            }
            // ** ready for any lib updates
        }
        await this.downloadLibMetadata(libTag);
        // ** if any libs in the lib directory update them with dependencies and create stubs
        await this.updateLibraries();
    }

    // this can be called from main extension ####TBD#### should it only be called from command in this class????
    public async updateLibraries() {
        //get the actual lib path
        const libPath=await getLibPath();
        if(libPath==='') {
            //nothing to do yet until libs are picked
            return;
        }
        let libNeeds: string[] = [];
        const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
        if(!wsRootFolder) {return;}
        const libContents=await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(wsRootFolder.uri,libPath));
        for(const [libName, libType] of libContents) {
            libNeeds.push(libName.replace('.mpy',''));
        }
        if(libNeeds.length===0) {
            vscode.window.showInformationMessage('No libraries to update');
            return;
        }
        // read the metadata file to pick up the dependencies
        const libMetadataPath = path.join(this._libArchiveUri.fsPath,`adafruit-circuitpython-bundle-${this._libTag}.json`);
        if(!fs.existsSync(libMetadataPath)) {
            vscode.window.showErrorMessage('Library metadata file not found');
            return;
        }
        const libMetadata = JSON.parse(fs.readFileSync(libMetadataPath, 'utf8'));
        let libMetaDeps: string[] = [];
        for (const lib of libNeeds) {
            if (libMetadata[lib] && libMetadata[lib].dependencies) {
                libMetaDeps = libMetaDeps.concat(libMetadata[lib].dependencies);
            }
        }
        libMetaDeps=[...new Set(libMetaDeps)]; //remove duplicates
        //first the stubs, can replace the whole libstuds folder
        let libStubsNeeds = libNeeds.concat(libMetaDeps);
        libStubsNeeds=[...new Set(libStubsNeeds)]; //remove duplicates
        const libExtractTarget: string = vscode.Uri.joinPath(this._libArchiveUri,"libstubs").fsPath;
        let libOnlyZipFile: string = vscode.Uri.joinPath(this._libArchiveUri,`adafruit-circuitpython-bundle-py-${this._libTag}-lib.zip`).fsPath;
        try {
            await this.ziplibextractneeds(libStubsNeeds, libOnlyZipFile, libExtractTarget);
        } catch (error) {
            vscode.window.showErrorMessage('Error extracting the lib stubs from the original bundle zip files');
            return;
        }
        //now the actual lib files- only add/update the dependencies
        const libExtractTargetLib: string = vscode.Uri.joinPath(wsRootFolder.uri,libPath).fsPath;
        const libExtractLibTemp:string = path.join(this._tempBundlesDir,"libDepsCopy");
        const cpVersionFmt = `${this._cpVersion}.x-mpy`;
        libOnlyZipFile = vscode.Uri.joinPath(this._libArchiveUri,`adafruit-circuitpython-bundle-${cpVersionFmt}-${this._libTag}-lib.zip`).fsPath;
        try {
            await this.ziplibextractneeds(libMetaDeps, libOnlyZipFile, libExtractLibTemp);
        } catch (error) {
            vscode.window.showErrorMessage('Error extracting the lib stubs from the original bundle zip files');
            return;
        }
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
        //clean up the temp dir
        fs.rmSync(libExtractLibTemp, { recursive: true });
        // set the libstubs in the settings for pylance
        // ######TBD##### need to check if already set and add to array
        await vscode.workspace.getConfiguration().update('python.analysis.extraPaths', [libExtractTarget], vscode.ConfigurationTarget.Workspace);
        // ** done with updating the libraries
        vscode.window.showInformationMessage('Libraries updated for tag: ' + this._libTag + ' and CP version: ' + this._cpVersion);
    }


    // ** private properties **
    private _tempBundlesDir: string = '';
    private _context: vscode.ExtensionContext;
    private _libArchiveUri:vscode.Uri;
    private _libTag: string = '';
    private _cpVersion: string = '';

    // ** private methods **

    private async downloadOrigBundle(libTag: string, pyLibFmt: string): Promise<string> {
        //check to see if already downloaded
        const tmpZipPath=path.join(this._tempBundlesDir, `adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}.zip`);
        if(fs.existsSync(tmpZipPath)) {
            console.log('File already exists:', tmpZipPath);
            return 'file already exists';
        }
        //download the file
        try {
            const response = await axios.default({
                method: 'get',
                url: `https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/download/${libTag}/adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}.zip`,
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
        const dest = path.join(this._libArchiveUri.fsPath,`adafruit-circuitpython-bundle-${libTag}.json`);
        //check first if already downloaded
        if
        (fs.existsSync(dest)) {
            console.log('File already exists:', dest);
            return 'file already exists';
        }
        try {
            const response = await axios.default({
                method: 'get',
                url: `https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/download/${libTag}/adafruit-circuitpython-bundle-${libTag}.json`,
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
