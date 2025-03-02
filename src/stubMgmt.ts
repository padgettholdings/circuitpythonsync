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
    private _customCancelToken: vscode.CancellationTokenSource | null = null;

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
            // should have all the stubs now
            const boardList = await this.getBoardList();
            const board = await vscode.window.showQuickPick(boardList, { placeHolder: '' });
            if (board) {
                if(!this._cpVersionFullStubUri){return;}  //should not happen
                const boardDirUri = vscode.Uri.joinPath(this._cpVersionFullStubUri, 'board_definitions');
                const boardStubExtraPath = await this.createBoardStubExtraPath(boardDirUri,board.label);
                console.log('boardStubExtraPath:',boardStubExtraPath);
                //save to config
                await vscode.workspace.getConfiguration().update('circuitpythonsync.cpboardname', board.label, vscode.ConfigurationTarget.Workspace);
                //and update the python analysis extra paths, must be at top
                //  AND replace any other board def
                let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get('python.analysis.extraPaths',[]);
                //extraPathsConfig=extraPathsConfig.filter((value)=>!value.includes('circuitpython_stubs-'+this._cpVersionFull+'/board_definitions'));
                const bdefextrapath= /circuitpython_stubs-.*\/board_definitions/i;
                extraPathsConfig=extraPathsConfig.filter(value => !bdefextrapath.test(value));
                extraPathsConfig=[boardStubExtraPath,...extraPathsConfig];
                extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
                await vscode.workspace.getConfiguration().update('python.analysis.extraPaths', extraPathsConfig, vscode.ConfigurationTarget.Workspace);



                //const boardInfo = await this.getBoardInfo(board);
                //const boardPath = await this.getBoardPath(boardInfo);
                //await this.installBoard(boardPath);
                //const boardStubPathBase = '/home/stan/my-typescript-project/stubs/circuitpython_stubs-'+rlsTag+'/board_definitions/';
                //const boardStubExtraPath = await createBoardStubExtraPath(boardStubPathBase,boardName);
                //console.log('boardStubExtraPath:',boardStubExtraPath);
            }
        }
        );
        context.subscriptions.push(selectBoardCmd);
    }

    // **private methods**

    private async getBoardList(): Promise<vscode.QuickPickItem[]> {
        //read directory names in the board_definitions directory
        let retval=Array<vscode.QuickPickItem>(0);
        if(!this._cpVersionFullStubUri){return retval;}  //should not happen
        const boardDirUri = vscode.Uri.joinPath(this._cpVersionFullStubUri, 'board_definitions');
        if(!fs.existsSync(boardDirUri.fsPath)){
            return retval;
        }
        //get the current board selection from config, if any, and put at top of quickpick list
        const curBoardSelection = vscode.workspace.getConfiguration().get('circuitpythonsync.cpboardname','');
        if(curBoardSelection){
            retval.push({label:curBoardSelection, description:'Current selection'});
        }
        const boards=await vscode.workspace.fs.readDirectory(boardDirUri);
        for(const board of boards){
            if(board[1]===vscode.FileType.Directory && board[0] !== curBoardSelection){
                retval.push({label:board[0]});
            }
        }
        return retval;
    }

    //create board stub extraPath, making board.pyi if needed in the stub
    private async  createBoardStubExtraPath(boardStubBaseUri: vscode.Uri,boardName:string):Promise<string>{
        const boardStubUri = vscode.Uri.joinPath(boardStubBaseUri,boardName + '/board.pyi');
        if (!fs.existsSync(boardStubUri.fsPath)) {
            fs.copyFileSync(vscode.Uri.joinPath(boardStubBaseUri,boardName+'/__init__.pyi').fsPath, boardStubUri.fsPath);
        }
        return vscode.Uri.joinPath(boardStubBaseUri,boardName).fsPath;
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

    private async getPyPiCPStubsJson(dest:string) {
        try {
            //if(!this._stubZipArchiveUri){return;}  //should not happen
            //const dest = vscode.Uri.joinPath(this._stubZipArchiveUri,'circuitpython-stubs.json').fsPath;
            const response = await axios.default({
                method: 'get',
                url: `https://pypi.org/pypi/circuitpython-stubs/json`,
                responseType: 'json'
            }).then((response) => {
                fs.writeFileSync(dest, JSON.stringify(response.data), {
                    encoding: "utf8",
                });
                console.log('Downloaded cp stubs metadata to:', dest);
            });
        } catch (error) {
            console.error('Error downloading the file:', error);
            throw error;
        }
        return 'done';
    }
    
    private async downloadStubs(dnldUrl: string, stubFilePath: string): Promise<string> {
        try {
            const response = await axios.default({
                method: 'get',
                url: dnldUrl,
                responseType: 'stream'
            });
    
            response.data.pipe(fs.createWriteStream(stubFilePath));
    
            return new Promise((resolve, reject) => {
                response.data.on('end', () => {
                    resolve('File downloaded successfully at:' + stubFilePath);
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
    
        // ** methods to show progress and stop with context flag
    
        // ** stop progress and set context flag
        private async stopStubUpdateProgress() {
            vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatingstubs', false);
            this._progInc=101;
            if(this._customCancelToken){
                this._customCancelToken.cancel();
            }
        }
        // ** show progress and set context flag
        private async showStubUpdateProgress(progressMessage:string) {
            vscode.commands.executeCommand('setContext', 'circuitpythonsync.updatingstubs', true);
            this._progInc=0;
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Py Stub Maintenance Progress",
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
    
    
    
    // **public methods**

    // get stubs into global storage, download if necessary, only call if have workspace
    public async installStubs(): Promise<void> {
        this._cpVersionFull = vscode.workspace.getConfiguration().get('circuitpythonsync.cpfullversion','');
        if(this._cpVersionFull===''){
            //vscode.window.showErrorMessage('Must set the CircuitPython full version in the settings.');
            throw new Error('Must set the CircuitPython full version in the settings.');
        }
        // ** start progress display **
        await this.showStubUpdateProgress('Checking/Updating Python stubs...');
        this._cpVersionFullStubUri = vscode.Uri.joinPath(this._stubsDirUri, 'circuitpython_stubs-'+this._cpVersionFull);
        if(fs.existsSync(this._cpVersionFullStubUri.fsPath)){
            this._progInc=50;
            //stubs already installed
            //just make sure extra path for the base stub dir is in config
            let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get('python.analysis.extraPaths',[]);
            const stubextrapath= /circuitpython_stubs-[\d\.]+$/i;
            extraPathsConfig=extraPathsConfig.filter(value => !stubextrapath.test(value));
            extraPathsConfig=extraPathsConfig.concat([this._cpVersionFullStubUri.fsPath]);
            extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
            // ** also do the board path in extrapaths in case version changed
            this._progInc=75;
            const boardName = vscode.workspace.getConfiguration().get('circuitpythonsync.cpboardname','');
            if(boardName){
                const bdefextrapath= /circuitpython_stubs-[\d\.]+.*board_definitions/i;
                extraPathsConfig=extraPathsConfig.filter(value => !bdefextrapath.test(value));
                const boardStubExtraPath = await this.createBoardStubExtraPath(vscode.Uri.joinPath(this._cpVersionFullStubUri, 'board_definitions'),boardName);
                extraPathsConfig=[boardStubExtraPath,...extraPathsConfig];
                extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
            }
            await vscode.workspace.getConfiguration().update('python.analysis.extraPaths', extraPathsConfig, vscode.ConfigurationTarget.Workspace);
            this.stopStubUpdateProgress();
            return;
        }
        this._progInc=10;
        // now check to see if the archive zip for this version is already downloaded
        if(!this._stubZipArchiveUri){return;}  //should not happen
        const stubZipArchiveTarUri = vscode.Uri.joinPath(this._stubZipArchiveUri, 'circuitpython_stubs-'+this._cpVersionFull+'.tar.gz');
        if(fs.existsSync(stubZipArchiveTarUri.fsPath)){
            //need to extract the tar file, does error checking and throws if needed
            this._progInc=75;
            await this.extractTarGz(stubZipArchiveTarUri.fsPath,this._stubsDirUri.fsPath);
            this.stopStubUpdateProgress();
            return;
        }
        // need to get the stub tar file and extract.  get a fresh pypi manifest
        this._progInc=20;
        if(!this._stubZipArchiveUri){return;}  //should not happen
        //create stub archive directory if not there
        if(!fs.existsSync(this._stubZipArchiveUri.fsPath)){
            fs.mkdirSync(this._stubZipArchiveUri.fsPath);
        }
        const destJson = vscode.Uri.joinPath(this._stubZipArchiveUri,'circuitpython-stubs.json').fsPath;
        await this.getPyPiCPStubsJson(destJson);    //error checks and throws if could not get
        this._progInc=40;
        //read and process the file for chosen release
        const stubsReleases = JSON.parse(fs.readFileSync(destJson, 'utf8'));
        let rls=stubsReleases.releases[this._cpVersionFull];
        if(!rls){
            this.stopStubUpdateProgress();
            throw new Error('No releases found for tag: '+this._cpVersionFull);
        }
        for(const r of rls){
            if(r.packagetype === 'sdist'){
                this._progInc=60;
                console.log('found sdist:',r.filename ,r.url);
                await this.downloadStubs(r.url, stubZipArchiveTarUri.fsPath);
                //now extract the sdist
                this._progInc=75;
                const zipSource = stubZipArchiveTarUri.fsPath;
                const zipTarget = this._stubsDirUri.fsPath;
                await this.extractTarGz(zipSource, zipTarget);
                //now set the extra path for the base stub dir
                let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get('python.analysis.extraPaths',[]);
                const stubextrapath= /circuitpython_stubs-[\d\.]+$/i;
                extraPathsConfig=extraPathsConfig.filter(value => !stubextrapath.test(value));
                extraPathsConfig=extraPathsConfig.concat([this._cpVersionFullStubUri.fsPath]);
                extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
                // ** also do the board path in extrapaths in case version changed
                const boardName = vscode.workspace.getConfiguration().get('circuitpythonsync.cpboardname','');
                if(boardName){
                    const bdefextrapath= /circuitpython_stubs-[\d\.]+.*board_definitions/i;
                    extraPathsConfig=extraPathsConfig.filter(value => !bdefextrapath.test(value));
                    const boardStubExtraPath = await this.createBoardStubExtraPath(vscode.Uri.joinPath(this._cpVersionFullStubUri, 'board_definitions'),boardName);
                    extraPathsConfig=[boardStubExtraPath,...extraPathsConfig];
                    extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
                }
                await vscode.workspace.getConfiguration().update('python.analysis.extraPaths', extraPathsConfig, vscode.ConfigurationTarget.Workspace);
                break;
            }
        }
        this.stopStubUpdateProgress();
    }
}
