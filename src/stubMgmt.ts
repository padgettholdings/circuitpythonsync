import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
import * as strgs from './strings';
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
    private _selectBoardButton: vscode.StatusBarItem | undefined;

    constructor(context: vscode.ExtensionContext)  {
        this._context = context;

        this._workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
        this._stubZipArchiveUri = vscode.workspace.workspaceFolders ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, strgs.stubArchiveFolderName) : undefined;
        this._progInc=0;    //set to greater than 100 to stop progress

        // #72, add help button to board select
        const iconCommand2:ThemeIcon=new ThemeIcon('question');
        interface cmdQuickInputButton extends QuickInputButton {
			commandName: string;
		}
        const helpButton:cmdQuickInputButton={
            iconPath:iconCommand2,
            tooltip:strgs.helpTooltipMap.get(strgs.helpBoardSupport),
            commandName: "help"
        };

        if(!fs.existsSync(this._context.globalStorageUri.fsPath)){
            fs.mkdirSync(this._context.globalStorageUri.fsPath);
        }
        this._stubsDirUri = vscode.Uri.joinPath(this._context.globalStorageUri, strgs.stubsGlobalStorageFolderName);
        if(!fs.existsSync(this._stubsDirUri.fsPath)){
            fs.mkdirSync(this._stubsDirUri.fsPath);
        }

        const selectBoardCmdId=strgs.cmdSelectBoardPKG;
        const selectBoardCmd=vscode.commands.registerCommand(selectBoardCmdId, async (boardFilterName:string) => {
            if(!this._workspaceUri){
                vscode.window.showErrorMessage(strgs.mustHaveWkspce);
                return;
            }
            //check for cp full version
            // **NO** let the install check for the version and setup latest if needed
            /*
            const cpVersionFull:string = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
            if(cpVersionFull===''){
                vscode.window.showErrorMessage(strgs.selectBoardMustSetCPVer);
                return;
            }
            this._cpVersionFull = cpVersionFull;
            */
            //this._cpVersionFullStubUri = vscode.Uri.joinPath(this._stubsDirUri, 'circuitpython_stubs-'+this._cpVersionFull);
            // let the install chech all parts of stub setup
            try{
                await this.installStubs();
            }catch(err){
                vscode.window.showErrorMessage(strgs.stubDnldErrorMsg+this.getErrorMessage(err));
                this.stopStubUpdateProgress();
                return;
            }
            let boardFilter:string=(boardFilterName && boardFilterName!==undefined) ? boardFilterName : '';
            // should have all the stubs now
            // ** #64, note that for older versions there are no board definitions, so not it in placeholder
            const boardList = await this.getBoardList();
            // ** #90, convert to standard quick pick so have access to filter
            const qpBoards=vscode.window.createQuickPick<vscode.QuickPickItem>();
            qpBoards.items=boardList;
            qpBoards.placeholder = boardList.length>0 ?  strgs.boardSelQPplaceholderNormal : strgs.boardSelQPplaceholderNoneAvail;    // strgs.boardListPlaceholder;
            qpBoards.title = strgs.boardSelQPtitle;  // strgs.boardListTitle;
            qpBoards.buttons=[helpButton];
            if(boardFilter && boardFilter.length>0){
                qpBoards.value=boardFilter; // set the initial value to filter on
            }
            qpBoards.onDidTriggerButton((button) => {  
                const btn=button as cmdQuickInputButton;
                if (btn.commandName === 'help') {
                    qpBoards.hide();
                    // show the help page
                    vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpBoardSupport);
                }
            }); 
            qpBoards.onDidChangeSelection(async (items) => {
                if (items.length === 0) {
                    return; // no selection
                }
                const selectedBoard = items[0];
                if (!selectedBoard.label) {
                    return; // no label, shouldn't happen
                }
                // got a board
                // allow the quick pick to close on selection
                qpBoards.hide();
                //
                if(!this._cpVersionFullStubUri){return;}  //should not happen
                const boardDirUri = vscode.Uri.joinPath(this._cpVersionFullStubUri, 'board_definitions');
                const boardStubExtraPath = await this.createBoardStubExtraPath(boardDirUri,selectedBoard.label);
                console.log('boardStubExtraPath:',boardStubExtraPath);
                //save to config
                await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confBoardNamePKG}`, selectedBoard.label, vscode.ConfigurationTarget.Workspace);
                //and update the python analysis extra paths, must be at top
                //  AND replace any other board def
                let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get(strgs.confPyExtraPathsPKG,[]);
                //extraPathsConfig=extraPathsConfig.filter((value)=>!value.includes('circuitpython_stubs-'+this._cpVersionFull+'/board_definitions'));
                const bdefextrapath= /circuitpython_stubs-[\d\.]+.*board_definitions/i;
                extraPathsConfig=extraPathsConfig.filter(value => !bdefextrapath.test(value));
                extraPathsConfig=[boardStubExtraPath,...extraPathsConfig];
                extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
                await vscode.workspace.getConfiguration().update(strgs.confPyExtraPathsPKG, extraPathsConfig, vscode.ConfigurationTarget.Workspace);
                //update the status bar button
                if(this._selectBoardButton){
                    this._selectBoardButton.tooltip = new vscode.MarkdownString(strgs.boardButtonSetTTMKDN[0]+selectedBoard.label+strgs.boardButtonSetTTMKDN[1]);
                }

                //const boardInfo = await this.getBoardInfo(board);
                //const boardPath = await this.getBoardPath(boardInfo);
                //await this.installBoard(boardPath);
                //const boardStubPathBase = '/home/stan/my-typescript-project/stubs/circuitpython_stubs-'+rlsTag+'/board_definitions/';
                //const boardStubExtraPath = await createBoardStubExtraPath(boardStubPathBase,boardName);
                //console.log('boardStubExtraPath:',boardStubExtraPath);
                // ** #73, if drive not mapped ask if want to map it
                const curDriveMap = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confDrivepathPKG}`,'');
                if(!curDriveMap){
                    const ans=await vscode.window.showInformationMessage(strgs.boardSelAskMapDrive, 'Yes','No','Help');
                    if(ans==='Yes'){
                        // call the select board command
                        vscode.commands.executeCommand(strgs.cmdSetDirPKG);
                    } else if(ans==='Help'){
                        // show the help page
                        vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpDriveMapping);
                        return;
                    }         
                }
            });
            qpBoards.onDidHide(() => {
                // cleanup when hidden
                qpBoards.dispose();
            });
            qpBoards.show();
            /*
            const board = await vscode.window.showQuickPick(boardList, { placeHolder: '' });
            if (board) {
                if(!this._cpVersionFullStubUri){return;}  //should not happen
                const boardDirUri = vscode.Uri.joinPath(this._cpVersionFullStubUri, 'board_definitions');
                const boardStubExtraPath = await this.createBoardStubExtraPath(boardDirUri,board.label);
                console.log('boardStubExtraPath:',boardStubExtraPath);
                //save to config
                await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confBoardNamePKG}`, board.label, vscode.ConfigurationTarget.Workspace);
                //and update the python analysis extra paths, must be at top
                //  AND replace any other board def
                let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get(strgs.confPyExtraPathsPKG,[]);
                //extraPathsConfig=extraPathsConfig.filter((value)=>!value.includes('circuitpython_stubs-'+this._cpVersionFull+'/board_definitions'));
                const bdefextrapath= /circuitpython_stubs-[\d\.]+.*board_definitions/i;
                extraPathsConfig=extraPathsConfig.filter(value => !bdefextrapath.test(value));
                extraPathsConfig=[boardStubExtraPath,...extraPathsConfig];
                extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
                await vscode.workspace.getConfiguration().update(strgs.confPyExtraPathsPKG, extraPathsConfig, vscode.ConfigurationTarget.Workspace);
                //update the status bar button
                if(this._selectBoardButton){
                    this._selectBoardButton.tooltip = new vscode.MarkdownString(strgs.boardButtonSetTTMKDN[0]+board.label+strgs.boardButtonSetTTMKDN[1]);
                }

                //const boardInfo = await this.getBoardInfo(board);
                //const boardPath = await this.getBoardPath(boardInfo);
                //await this.installBoard(boardPath);
                //const boardStubPathBase = '/home/stan/my-typescript-project/stubs/circuitpython_stubs-'+rlsTag+'/board_definitions/';
                //const boardStubExtraPath = await createBoardStubExtraPath(boardStubPathBase,boardName);
                //console.log('boardStubExtraPath:',boardStubExtraPath);
                // ** #73, if drive not mapped ask if want to map it
                const curDriveMap = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confDrivepathPKG}`,'');
                if(!curDriveMap){
                    const ans=await vscode.window.showInformationMessage('Do you want to map the CP board drive?', 'Yes','No');
                    if(ans==='Yes'){
                        // call the select board command
                        vscode.commands.executeCommand(strgs.cmdSetDirPKG);
                    }                   
                }
            }
            */
        }
        );
        context.subscriptions.push(selectBoardCmd);

        // create status bar button linked to selectBoardCmd
        const curBoardSelection = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confBoardNamePKG}`,'');
        this._selectBoardButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,52);
        this._selectBoardButton.text = 'CP$(circuit-board)';
        this._selectBoardButton.command = selectBoardCmdId;
        this._selectBoardButton.tooltip = curBoardSelection ? new vscode.MarkdownString(strgs.boardButtonSetTTMKDN[0]+curBoardSelection+strgs.boardButtonSetTTMKDN[1]) : strgs.boardButtonNotSetTTMKDN;
        //don't show button if no workspace
        if(this._workspaceUri){
            this._selectBoardButton.show();
        } else {
            this._selectBoardButton.hide();
        }
        this._context.subscriptions.push(this._selectBoardButton);

        // ** monitor config changes so can keep button updated to board selection, really just for empty/null board names
        vscode.workspace.onDidChangeConfiguration((e) => {  
            if(e.affectsConfiguration(`circuitpythonsync.${strgs.confBoardNamePKG}`) && this._selectBoardButton){
                const curBoardSelection = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confBoardNamePKG}`,'');
                this._selectBoardButton.tooltip = curBoardSelection ? new vscode.MarkdownString(strgs.boardButtonSetTTMKDN[0]+curBoardSelection+strgs.boardButtonSetTTMKDN[1]) : strgs.boardButtonNotSetTTMKDN;
            }
        }
        );
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
        const curBoardSelection = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confBoardNamePKG}`,'');
        if(curBoardSelection){
            retval.push({label:curBoardSelection, description:strgs.boardListSelectedQPItem.description});
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
    // ** #64, bug fix, versions before 9.x don't have board definitions, look for it before trying to fixup
    private async  createBoardStubExtraPath(boardStubBaseUri: vscode.Uri,boardName:string):Promise<string>{
        // ** #64, bug fix, versions before 9.x don't have board definitions, look for it before trying to fixup
        if(!fs.existsSync(boardStubBaseUri.fsPath)){
            return "";  // this indicates no board definitions for this version
        }
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
            console.error(`${strgs.stubsTarGzExtractError}${tarGzPath}:`, error);
            throw new Error(`${strgs.stubsTarGzExtractError}${tarGzPath}:`+this.getErrorMessage(error));
        }
    }

    private async getPyPiCPStubsJson(dest:string) {
        try {
            //if(!this._stubZipArchiveUri){return;}  //should not happen
            //const dest = vscode.Uri.joinPath(this._stubZipArchiveUri,'circuitpython-stubs.json').fsPath;
            const response = await axios.default({
                method: 'get',
                url: strgs.stubsPyPiMetadataUrl,
                responseType: 'json'
            }).then((response) => {
                fs.writeFileSync(dest, JSON.stringify(response.data), {
                    encoding: "utf8",
                });
                console.log(strgs.stubsPyPiMetadataDnldLog, dest);
            });
        } catch (error) {
            console.error(strgs.stubsPyPiMetadataDnldErrorLog, error);
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
                    resolve(strgs.stubsPyPiFileDnldSuccessRtn + stubFilePath);
                });
    
                response.data.on('error', (err: any) => {
                    reject(err);
                });
            });
        } catch (error) {
            console.error(strgs.stubsPyPiFileDnldErrorLog, error);
            throw error;
        }
    }
    
    // ** methods to show progress and stop with context flag

    // ** stop progress and set context flag
    public async stopStubUpdateProgress() {
        vscode.commands.executeCommand('setContext', strgs.stubsUpdatingContextKeyPKG, false);
        this._progInc=101;
        if(this._customCancelToken){
            this._customCancelToken.cancel();
        }
    }
    // ** show progress and set context flag
    private async showStubUpdateProgress(progressMessage:string) {
        vscode.commands.executeCommand('setContext', strgs.stubsUpdatingContextKeyPKG, true);
        this._progInc=0;
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: strgs.updateStubsProgressTitle,
            cancellable: false
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log(strgs.updateStubsProgressCancelLog);
                vscode.commands.executeCommand('setContext', strgs.stubsUpdatingContextKeyPKG, false);
            });
            progress.report({ increment: 0 });
            const p = new Promise<void>(resolve => {
                const intvlId=setInterval(() => {
                    progress.report({increment:this._progInc,message:progressMessage,});
                    if(this._progInc>=100){
                        clearInterval(intvlId);
                        vscode.commands.executeCommand('setContext', strgs.stubsUpdatingContextKeyPKG, false);
                        resolve();
                    }
                },500);
                setTimeout(() => {
                    clearInterval(intvlId);
                    vscode.commands.executeCommand('setContext', strgs.stubsUpdatingContextKeyPKG, false);
                    resolve();
                }, 20000);	// ****** TBD ****** how to set max timeout
                //hook up the custom cancel token
                this._customCancelToken=new vscode.CancellationTokenSource();
                this._customCancelToken.token.onCancellationRequested(() => {
                    this._customCancelToken?.dispose();
                    this._customCancelToken=null;
                    clearInterval(intvlId);
                    vscode.commands.executeCommand('setContext', strgs.stubsUpdatingContextKeyPKG, false);
                    resolve();
                });
            });
            return p;
        });
    }
    
    private async refreshExtraPaths(cpVersionFullStubUri: vscode.Uri) {
        //just make sure extra path for the base stub dir is in config
        let extraPathsConfig:string[]=vscode.workspace.getConfiguration().get(strgs.confPyExtraPathsPKG,[]);
        const stubextrapath= /circuitpython_stubs-[\d\.]+$/i;
        extraPathsConfig=extraPathsConfig.filter(value => !stubextrapath.test(value));
        extraPathsConfig=extraPathsConfig.concat([cpVersionFullStubUri.fsPath]);
        extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
        // ** also do the board path in extrapaths in case version changed
        const boardName = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confBoardNamePKG}`,'');
        if(boardName){
            const bdefextrapath= /circuitpython_stubs-[\d\.]+.*board_definitions/i;
            extraPathsConfig=extraPathsConfig.filter(value => !bdefextrapath.test(value));
            const boardStubExtraPath = await this.createBoardStubExtraPath(vscode.Uri.joinPath(cpVersionFullStubUri, 'board_definitions'),boardName);
            // ** #64, bug fix, if no board definitions then don't add to extra paths
            if(boardStubExtraPath){
                extraPathsConfig=[boardStubExtraPath,...extraPathsConfig];
                extraPathsConfig=[...new Set(extraPathsConfig)]; //remove duplicates
            }
        }
        await vscode.workspace.getConfiguration().update(strgs.confPyExtraPathsPKG, extraPathsConfig, vscode.ConfigurationTarget.Workspace);
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

    private async getLatestCPTag(): Promise<string> {
        let r: axios.AxiosResponse = await axios.default.get(
            strgs.libCPAdafruitUrlLatest,
            { headers: { Accept: "application/json" } }
        );
        return await r.data.tag_name;
    }


    // **public methods**

    // get stubs into global storage, download if necessary, only call if have workspace
    public async installStubs(): Promise<void> {
        this._cpVersionFull = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
        if(this._cpVersionFull===''){
            //vscode.window.showErrorMessage('Must set the CircuitPython full version in the settings.');
            //throw new Error(strgs.installStubsMustSetCPVer);
            // **NO** go ahead and fetch the latest like libs does
            try{
                const latestCPTag=await this.getLatestCPTag();
                this._cpVersionFull=latestCPTag;
            }catch(err){
                vscode.window.showErrorMessage(strgs.installStubsGetLatestCPTagErrMsg+err);
                return;
            }
            await vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confCPfullverPKG}`,this._cpVersionFull,vscode.ConfigurationTarget.Workspace);
        }
        // ** start progress display **
        await this.showStubUpdateProgress(strgs.installStubsProgressMsg);
        if(!this._stubZipArchiveUri){return;}  //should not happen
        const stubZipArchiveTarUri = vscode.Uri.joinPath(this._stubZipArchiveUri, 'circuitpython_stubs-'+this._cpVersionFull+'.tar.gz');

        this._cpVersionFullStubUri = vscode.Uri.joinPath(this._stubsDirUri, 'circuitpython_stubs-'+this._cpVersionFull);
        if(fs.existsSync(this._cpVersionFullStubUri.fsPath) && fs.existsSync(stubZipArchiveTarUri.fsPath)){
            this._progInc=75;
            //stubs already installed- **NOTE** don't clean up at this point, only when new stubs loaded
            //just make sure extra path for the base stub dir is in config
            await this.refreshExtraPaths(this._cpVersionFullStubUri);
            /*
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
            */
            this.stopStubUpdateProgress();
            return;
        }
        this._progInc=10;
        // now check to see if the archive zip for this version is already downloaded
        //if(!this._stubZipArchiveUri){return;}  //should not happen
        //const stubZipArchiveTarUri = vscode.Uri.joinPath(this._stubZipArchiveUri, 'circuitpython_stubs-'+this._cpVersionFull+'.tar.gz');
        if(fs.existsSync(stubZipArchiveTarUri.fsPath)){
            //need to extract the tar file, does error checking and throws if needed
            this._progInc=75;
            try {
                await this.extractTarGz(stubZipArchiveTarUri.fsPath,this._stubsDirUri.fsPath);
                // ###TBD### clean up any old stubs directories
                // remove stub directories that are not the current version 
                const stubsDirContents=await vscode.workspace.fs.readDirectory(this._stubsDirUri);
                for(let stubDir of stubsDirContents){
                    // ** #64, bug fix, normalize all dirs to 'circuitpython_stubs-<version>' format not 'circuitpython-stubs-<version>.*'
                    if(stubDir[1]===vscode.FileType.Directory && stubDir[0].startsWith('circuitpython-stubs')){ 
                        const origStubDir=stubDir[0];
                        stubDir[0]=stubDir[0].replace('circuitpython-stubs','circuitpython_stubs');
                        const stubDirOrigUri = vscode.Uri.joinPath(this._stubsDirUri,origStubDir);
                        const stubDirNewUri = vscode.Uri.joinPath(this._stubsDirUri,stubDir[0]);
                        vscode.workspace.fs.rename(stubDirOrigUri,stubDirNewUri,{overwrite:true});
                    }
                    if(stubDir[1]===vscode.FileType.Directory && stubDir[0] !== 'circuitpython_stubs-'+this._cpVersionFull){
                        const stubDirUri = vscode.Uri.joinPath(this._stubsDirUri,stubDir[0]);
                        fs.rmdirSync(stubDirUri.fsPath,{recursive:true});
                    }
                }
                // ###TBD### refresh the extra paths
                await this.refreshExtraPaths(this._cpVersionFullStubUri);
                //
            } catch (error) {
                vscode.window.showErrorMessage(strgs.installStubsExtractErrMsg+this.getErrorMessage(error));
            }
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
        const destJson = vscode.Uri.joinPath(this._stubZipArchiveUri,strgs.installStubsMetadataFilename).fsPath;
        try {
            await this.getPyPiCPStubsJson(destJson);    //error checks and throws if could not get
        } catch (error) {
            vscode.window.showErrorMessage(strgs.installStubsMetadataGetError+this.getErrorMessage(error));
            this.stopStubUpdateProgress();
            return;
        }
        this._progInc=40;
        //read and process the file for chosen release
        const stubsReleases = JSON.parse(fs.readFileSync(destJson, 'utf8'));
        let rls=stubsReleases.releases[this._cpVersionFull];
        if(!rls){
            //throw new Error('No releases found for tag: '+this._cpVersionFull);
            vscode.window.showErrorMessage(strgs.installStubsNoRelForCpVerErr+this._cpVersionFull);
            this.stopStubUpdateProgress();
            return;
        }
        for(const r of rls){
            if(r.packagetype === 'sdist'){
                this._progInc=60;
                console.log('found sdist:',r.filename ,r.url);
                try {
                    await this.downloadStubs(r.url, stubZipArchiveTarUri.fsPath);
                } catch (error) {
                    vscode.window.showErrorMessage(strgs.installStubsDnldErr+this.getErrorMessage(error));
                    this.stopStubUpdateProgress();
                    return;
                }
                //now extract the sdist
                this._progInc=75;
                const zipSource = stubZipArchiveTarUri.fsPath;
                const zipTarget = this._stubsDirUri.fsPath;
                try {
                    await this.extractTarGz(zipSource, zipTarget);
                } catch (error) {
                    vscode.window.showErrorMessage(strgs.installStubsExtractErrMsg+this.getErrorMessage(error));
                    this.stopStubUpdateProgress();
                    return;
                }
                // remove stub directories that are not the current version 
                const stubsDirContents=await vscode.workspace.fs.readDirectory(this._stubsDirUri);
                for(const stubDir of stubsDirContents){
                    // ** #64, bug fix, normalize all dirs to 'circuitpython_stubs-<version>' format not 'circuitpython-stubs-<version>.*'
                    if(stubDir[1]===vscode.FileType.Directory && stubDir[0].startsWith('circuitpython-stubs')){ 
                        const origStubDir=stubDir[0];
                        stubDir[0]=stubDir[0].replace('circuitpython-stubs','circuitpython_stubs');
                        const stubDirOrigUri = vscode.Uri.joinPath(this._stubsDirUri,origStubDir);
                        const stubDirNewUri = vscode.Uri.joinPath(this._stubsDirUri,stubDir[0]);
                        vscode.workspace.fs.rename(stubDirOrigUri,stubDirNewUri,{overwrite:true});
                    }
                    if(stubDir[1]===vscode.FileType.Directory && stubDir[0] !== 'circuitpython_stubs-'+this._cpVersionFull){ 
                        const stubDirUri = vscode.Uri.joinPath(this._stubsDirUri,stubDir[0]);
                        fs.rmdirSync(stubDirUri.fsPath,{recursive:true});
                    }
                }
                //now set the extra path for the base stub dir
                await this.refreshExtraPaths(this._cpVersionFullStubUri);
                /*
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
                */
                break;
            }
        }
        this.stopStubUpdateProgress();
    }

    // ** provide access to stubs archive folder exists as a way to see if setup is done
    public stubsArchiveExists(): boolean {
        // ** #64, managing full cp version now, so check actual file too
        // but can short circuit if stub archive folder not there, meaning setup not done
        if(!this._stubZipArchiveUri){return false;}  //should not happen
        const archExists= fs.existsSync(this._stubZipArchiveUri.fsPath);
        if(!archExists){
            return false;
        }
        // ** #64, check for the actual stub archive file, if doesn't exist then setup not done
        // must have current cp version
        this._cpVersionFull = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confCPfullverPKG}`,'');
        const stubZipArchiveTarUri = vscode.Uri.joinPath(this._stubZipArchiveUri, 'circuitpython_stubs-'+this._cpVersionFull+'.tar.gz');
        const stubTarExists= fs.existsSync(stubZipArchiveTarUri.fsPath);
        if(!stubTarExists){
            return false;
        }
        // ** #64, finally check for the stubs dir in global storage, but use current cp full version!!
        const cpVersionFullStubUri = vscode.Uri.joinPath(this._stubsDirUri, 'circuitpython_stubs-'+this._cpVersionFull);
        const stubsDirExists= fs.existsSync(cpVersionFullStubUri.fsPath);
        if(!stubsDirExists){
            return false;
        }
        // all passed, good to go
        return true;
    }
}
