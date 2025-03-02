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
    
    
    // **public methods**

    // get stubs into global storage, download if necessary, only call if have workspace
    public async installStubs(): Promise<void> {
        this._cpVersionFull = vscode.workspace.getConfiguration().get('circuitpythonsync.cpfullversion','');
        if(this._cpVersionFull===''){
            //vscode.window.showErrorMessage('Must set the CircuitPython full version in the settings.');
            throw new Error('Must set the CircuitPython full version in the settings.');
        }
        this._cpVersionFullStubUri = vscode.Uri.joinPath(this._stubsDirUri, 'circuitpython_stubs-'+this._cpVersionFull);
        if(fs.existsSync(this._cpVersionFullStubUri.fsPath)){
            //stubs already installed
            //just make sure extra path for the base stub dir is in config
            let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get('python.analysis.extraPaths',[]);
            extraPathsConfig=extraPathsConfig.concat([this._cpVersionFullStubUri.fsPath]);
            extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
            await vscode.workspace.getConfiguration().update('python.analysis.extraPaths', extraPathsConfig, vscode.ConfigurationTarget.Workspace);
            return;
        }
        // now check to see if the archive zip for this version is already downloaded
        if(!this._stubZipArchiveUri){return;}  //should not happen
        const stubZipArchiveTarUri = vscode.Uri.joinPath(this._stubZipArchiveUri, 'circuitpython_stubs-'+this._cpVersionFull+'.tar.gz');
        if(fs.existsSync(stubZipArchiveTarUri.fsPath)){
            //need to extract the tar file, does error checking and throws if needed
            await this.extractTarGz(stubZipArchiveTarUri.fsPath,this._stubsDirUri.fsPath);
            return;
        }
        // need to get the stub tar file and extract.  get a fresh pypi manifest
        if(!this._stubZipArchiveUri){return;}  //should not happen
        //create stub archive directory if not there
        if(!fs.existsSync(this._stubZipArchiveUri.fsPath)){
            fs.mkdirSync(this._stubZipArchiveUri.fsPath);
        }
        const destJson = vscode.Uri.joinPath(this._stubZipArchiveUri,'circuitpython-stubs.json').fsPath;
        await this.getPyPiCPStubsJson(destJson);    //error checks and throws if could not get
        //read and process the file for chosen release
        const stubsReleases = JSON.parse(fs.readFileSync(destJson, 'utf8'));
        let rls=stubsReleases.releases[this._cpVersionFull];
        if(!rls){
            throw new Error('No releases found for tag: '+this._cpVersionFull);
        }
        for(const r of rls){
            if(r.packagetype === 'sdist'){
                console.log('found sdist:',r.filename ,r.url);
                await this.downloadStubs(r.url, stubZipArchiveTarUri.fsPath);
                //now extract the sdist
                const zipSource = stubZipArchiveTarUri.fsPath;
                const zipTarget = this._stubsDirUri.fsPath;
                await this.extractTarGz(zipSource, zipTarget);
                //now set the extra path for the base stub dir
                let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get('python.analysis.extraPaths',[]);
                const stubextrapath= /circuitpython_stubs-[\d\.]+$/i;
                extraPathsConfig=extraPathsConfig.filter(value => !stubextrapath.test(value));
                extraPathsConfig=extraPathsConfig.concat([this._cpVersionFullStubUri.fsPath]);
                extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
                await vscode.workspace.getConfiguration().update('python.analysis.extraPaths', extraPathsConfig, vscode.ConfigurationTarget.Workspace);
                break;
            }
        }
    }
}
