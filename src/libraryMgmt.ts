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
        const pyLibFmts = ['py', cpVersionFmt];
        pyLibFmts.forEach(async (pyLibFmt) => {
            await this.getOrigBundle(libTag, pyLibFmt);
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


    // ** private properties **
    private _tempBundlesDir: string = '';

    // ** private methods **

    private async downloadOrigBundle(libTag: string, pyLibFmt: string): Promise<string> {
        try {
            const response = await axios.default({
                method: 'get',
                url: `https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/download/${libTag}/adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}.zip`,
                responseType: 'stream'
            });
            const tmpZipPath=path.join(this._tempBundlesDir, `adafruit-circuitpython-bundle-${pyLibFmt}-${libTag}.zip`);
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
        try {
            const response = await axios.default({
                method: 'get',
                url: `https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/download/${libTag}/adafruit-circuitpython-bundle-${libTag}.json`,
                responseType: 'json'
            }).then((response) => {
                const dest = `/home/stan/my-typescript-project/ziplibextract/adafruit-circuitpython-bundle-${libTag}.json`;
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
        await zl.archiveFolder(libOnlyZipTempDir + libOnlyZipArchiveName + "/lib/", libOnlyZipFile);
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
