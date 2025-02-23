import * as vscode from 'vscode';
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

        const openLibCmd=vscode.commands.registerCommand('extension.openLibraryMgmt', () => {
            vscode.window.showInformationMessage('Library Management');
        });
        context.subscriptions.push(openLibCmd);

        /*
        // get the libtag and cp version settings
        const libTag:string = vscode.workspace.getConfiguration().get('circuitpythonsync.curlibtag','');
        const cpVersion:string = vscode.workspace.getConfiguration().get('circuitpythonsync.cpbaseversion','');
        //if configs are not defined, ###TBD###
        if(libTag === '' || cpVersion === '') {
            vscode.window.showErrorMessage('Please set the library tag and CircuitPython version in the settings');
            return;
        }
        // refresh all files based on the libtag and cpversion
        const cpVersionFmt = `${cpVersion}.x-mpy`;
        // need temp space to download the zips
        const tempUriBase=context.globalStorageUri; //NOTE this may not initially exist
        this._tempBundlesDir = path.join(tempUriBase.fsPath, 'tempOrigBundles');
        // create the temp dir if it doesn't exist
        if (!fs.existsSync(this._tempBundlesDir)) {
            fs.mkdirSync(this._tempBundlesDir, { recursive: true });
        }
        // download the orig bundle zip files
        // ####TBD##### check for lib only zips before getting full bundles
        // first check for lib only zips in /libArchive
        const libArchiveUri=vscode.Uri.joinPath(workspaceUri,'libArchive');
        const libOnlyZipPyUri=vscode.Uri.joinPath(libArchiveUri,`adafruit-circuitpython-bundle-py-${libTag}-lib.zip`);
        const libOnlyZipMpyUri=vscode.Uri.joinPath(libArchiveUri,`adafruit-circuitpython-bundle-${cpVersionFmt}-${libTag}-lib.zip`);
        if(!fs.existsSync(libOnlyZipPyUri.fsPath) || !fs.existsSync(libOnlyZipMpyUri.fsPath)) {
            // get the full bundles and extract the lib folders
            const pyLibFmts = ['py', cpVersionFmt];
            try {
            for(const pyLibFMt of pyLibFmts) {
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
            pyLibFmts.forEach(async (pyLibFmt) => {
                const libOnlyZipFile: string = vscode.Uri.joinPath(libArchiveUri,`adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}-lib.zip`).fsPath;
                const libExtractTarget: string = "/home/stan/my-typescript-project/lib/";  // ####TBD#### need actual lib folder name first
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
            });
        */


        



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
    // **** the setup that is called after the constructor ****
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
        if(!fs.existsSync(libOnlyZipPyUri.fsPath) || !fs.existsSync(libOnlyZipMpyUri.fsPath)) {
            // get the full bundles and extract the lib folders if not there
            const pyLibFmts = ['py', cpVersionFmt];
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
                const libExtractTarget: string = "/home/stan/my-typescript-project/lib/";  // ####TBD#### need actual lib folder name first
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
                await this.downloadLibMetadata(libTag);
            }
            // ** ready for any lib updates
        }
        // ** if any libs in the lib directory update them with dependencies and create stubs

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
