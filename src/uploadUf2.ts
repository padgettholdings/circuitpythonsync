import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon, Disposable,QuickInputButtons } from 'vscode';
import * as strgs from './strings';
import * as axios from 'axios';
//import * as https from 'https';
import {Parser} from 'htmlparser2';
import Fuse from 'fuse.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as drivelist from './drivelist';
import { showFullQuickPick,QuickPickParameters,shouldResume } from './fullQuickPick';

// data types and other type declarations
interface cpboards {
    "data-id": string,
    "data-name": string,
    "data-manufacturer": string,
    "data-mcufamily": string
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
    promptLooking: string;
    promptFound: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	ignoreFocusOut?: boolean;
	placeholder?: string;
    placeholderLooking:string;
    placeholderFound:string;
	shouldResume: () => Thenable<boolean>;
}

class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

interface cpBoardPick extends vscode.QuickPickItem{
    boardId: string;
}

interface cmdQuickInputButton extends QuickInputButton {
	commandName: string;
}

// **#72, quick pick command buttons
const iconCommandHelp:ThemeIcon=new ThemeIcon('question');
const helpButton:cmdQuickInputButton={
    iconPath:iconCommandHelp,
    tooltip: strgs.helpTooltipMap.get(strgs.helpUploadingUf2),
    commandName:'help'
};

const iconCommandSearch:ThemeIcon=new ThemeIcon('search');
const searchButton:cmdQuickInputButton={
    iconPath:iconCommandSearch,
    tooltip: strgs.uf2LoadingManualSearchTooltip,
    commandName:'search'
};

// Need a non-instance narrowing test for buttons of this type for the full quick pick
function isCmdQuickInputButton(button: any): button is cmdQuickInputButton {
    return (button as cmdQuickInputButton).commandName !== undefined;
}



export class UploadUf2 {
    // ** public variables
    boardSearchThresholdLow:number=0.3;
    boardSearchThresholdHigh:number=0.6;

    // ** private variables
    private _context: vscode.ExtensionContext;
    //private _progInc: number;
    private _workspaceUri: vscode.Uri | undefined;
    private _cpSiteBoards: cpboards[];
    private _cpOrgUrl: string;
    private _steps: number;
    private _currentUI?: vscode.QuickInput;
    private _uf2drivepath: string;
    private _uf2infoContent: string;
    private _uf2infofilename:string;
    private _detectedDrives: drivelist.Drive[];
    private _driveSearchTimeout: number;
    private _maxBoardSearchResults:number=40;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._workspaceUri = undefined;
        this._cpSiteBoards = [];
        this._cpOrgUrl =strgs.uf2LoadingCPorgUrl;
        this._workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
        this._steps=3;
        this._uf2drivepath='';
        this._uf2infoContent='';
        this._uf2infofilename='';
        this._detectedDrives = [];
        this._driveSearchTimeout = 10000; // 10 seconds

        // setup the command
        const uploadUf2CmdId = strgs.cmdUf2LoadingPKG;
        let cmdUploadUf2 = vscode.commands.registerCommand(uploadUf2CmdId, async (ctxFile:vscode.Uri|undefined) => {
            if (!this._workspaceUri) {
                vscode.window.showErrorMessage(strgs.mustHaveWkspce);
                return;
            }
            //check to see if cp.org already fetched
            if (this._cpSiteBoards.length === 0) {
                // put up a loading info message with progress...
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: strgs.uf2LoadingFetchCPTitle,
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });
                    // fetch the html content from cp.org
                    let htmlContent='';
                    try {
                        htmlContent = await this.fetchWebsiteHTML(this._cpOrgUrl);
                    } catch (error) {
                        vscode.window.showErrorMessage(this.getErrorMessage(error));
                        return;
                    }
                    progress.report({ increment: 50, message: 'Parsing boards...' });
                    try{
                        this.parseCpBoards(htmlContent);
                    } catch (error) {
                        vscode.window.showErrorMessage(this.getErrorMessage(error));
                        return;
                    }
                    progress.report({ increment: 100, message: `Fetched ${this._cpSiteBoards.length} boards` });
                    //vscode.window.showInformationMessage(`Fetched ${this._cpSiteBoards.length} boards from circuitpython.org`);
                });
                /*
                let htmlContent='';
                try {
                    htmlContent = await this.fetchWebsiteHTML(this._cpOrgUrl);
                } catch (error) {
                    vscode.window.showErrorMessage(this.getErrorMessage(error));
                    return;
                }
                try{
                    this.parseCpBoards(htmlContent);
                } catch (error) {
                    vscode.window.showErrorMessage(this.getErrorMessage(error));
                    return;
                }
                vscode.window.showInformationMessage(`got ${this._cpSiteBoards.length} cp.org boards`);
                */
            }
            // start multi-step quick input with first step waiting for drive to connect
            let uf2drive=await this.showUf2DriveInputBox(
                {
                    title: (ctxFile ? strgs.uf2LoadingDriveInputTitleForContext : strgs.uf2LoadingDriveInputTitle),
                    step: 1,
                    totalSteps:1, //this._steps,
                    value: '',
                    prompt: strgs.uf2LoadingDriveInputPrompt,
                    promptLooking: strgs.uf2LoadingDriveInputPromptLooking,
                    promptFound: strgs.uf2LoadingDriveInputPromptFound,
                    validate: async (value) => {
                        if (value.trim().length === 0) {
                            return strgs.uf2LoadingDriveInputValidateEmpty;
                        }
                        // check if uf2 info file at path
                        try {
                            const files = await fs.promises.readdir(value);
                            const infoFound=files.find(file => file.toLowerCase()==='info_uf2.txt');
                            if (infoFound) {
                                this._uf2drivepath = value;
                                this._uf2infofilename=infoFound;
                                // If found, we can stop looking
                                return undefined;
                            } else {
                                return strgs.uf2LoadingDriveInputValidateNoInfoFile;
                            }
                        } catch (error) {
                            // just flag that file not found at path
                            return strgs.uf2LoadingDriveInputValidateNoInfoFile;
                        }
                        // ####MOCK- found drive
                        //this._uf2drivepath = value;
                        //this._uf2infofilename='INFO_UF2.TXT';   // ** NOTE THAT IF CHANGED THIS NEEDS TO BE RESET
                        // Additional validation can be added here
                        return undefined;
                    },
                    buttons: [
                        {
                            iconPath: new ThemeIcon('refresh'),
                            tooltip: strgs.uf2LoadingDriveInputBtnRefreshTooltip
                        },
                        {
                            iconPath: new ThemeIcon('question'),
                            tooltip: strgs.helpTooltipMap.get(strgs.helpUploadingUf2)
                        }
                    ],
                    ignoreFocusOut: true,
                    placeholder: strgs.uf2LoadingDriveInputPlaceholder,
                    placeholderLooking: strgs.uf2LoadingDriveInputPlaceholderLooking,
                    placeholderFound: strgs.uf2LoadingDriveInputPlaceholderFound,
                    shouldResume: () => {
                        // Could show a notification with the option to resume.
                        return new Promise<boolean>((resolve) => {
                            resolve(false); // For simplicity, we disable resume in this example.
                        });
                    }
                }
            );
            // now read the drive path and get info_uf2.txt contents
            if(typeof uf2drive!=='string'){
                //refresh button restarts this command
                if(uf2drive.iconPath.id==='refresh'){
                    // just restart command
                    // ** BUT pass context if it exists
                    if(ctxFile){
                        vscode.commands.executeCommand(uploadUf2CmdId,ctxFile);
                    } else {
                        vscode.commands.executeCommand(uploadUf2CmdId);
                    }
                // help link
                } else if(uf2drive.iconPath.id==='question'){
                    vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpUploadingUf2);
                } else {
                    vscode.window.showErrorMessage(strgs.uf2LoadingDriveInputBadAction);
                }
                return;
            }
            if(uf2drive===''){
                //just cancelled
                return;
            }
            this._uf2drivepath=uf2drive;
            const infoFilePath = path.join(uf2drive, this._uf2infofilename);
            let infoContent='';
            try {
                infoContent = await fs.promises.readFile(infoFilePath, 'utf-8');
                // Process the info content as needed
            } catch (error) {
                vscode.window.showErrorMessage(this.getErrorMessage(error));
                return;
            }
            //
            // ** parse the uf2 info content and use model to search cp boards
            this._uf2infoContent=infoContent;
            const infoLines:string[]=infoContent.split('\n');
            // Process the info lines as needed
            let boardModelFromUf2Info='';
            let boardIdFromUf2Info='';
            infoLines.forEach((line) => {
                // Example processing: extract board model from each line
                const match = line.match(/Model:\s*(.*)/);
                if (match) {
                    boardModelFromUf2Info = match[1].trim();
                    // Do something with the board model (e.g., store it)
                }
                const matchId = line.match(/Board-ID:\s*(.*)/);
                if (matchId) {
                    boardIdFromUf2Info = matchId[1].trim();
                }
            });
            if(boardModelFromUf2Info===''){
                vscode.window.showErrorMessage(strgs.uf2LoadingDriveCheckNoModelInInfo);
                return;
            }
            // ** if came into command from context click of a uf2 file, get the uri...
            let ctxUf2FileUri:vscode.Uri|undefined=undefined;
            if(ctxFile && ctxFile.fsPath.endsWith('.uf2')){
                ctxUf2FileUri=ctxFile as vscode.Uri;
                // ** do a confirmation that this file should be uploaded to board with model id boardModelFromUf2Info
                const confirm=await vscode.window.showQuickPick([
                    { label: strgs.uf2LoadingContextConfirmPicks[0] },
                    { label: strgs.uf2LoadingContextConfirmPicks[1] }
                ],{
                    title: strgs.uf2LoadingContextConfirmTitle(path.basename(ctxUf2FileUri.fsPath),boardModelFromUf2Info),
                    placeHolder: strgs.uf2LoadingContextConfirmPlaceholder,
                    canPickMany: false,
                    ignoreFocusOut: true
                });
                if(!confirm || confirm.label.toLowerCase().includes('no') || confirm.label.toLowerCase().includes('cancel')){
                    return;
                }
                // ** do the upload by copying the file to the drive path
                let baseUri=this._uf2drivepath;
                if (os.platform()==='win32') {
                    baseUri='file:'+baseUri;
                }
                //const destUri=vscode.Uri.parse(baseUri+'/'+path.basename(downloadUri.fsPath));
                const destUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),path.basename(ctxUf2FileUri.fsPath));
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: strgs.uf2LoadingUf2CopyProgressTitle,
                    cancellable: false
                }, async (progress) => {
                    if(!ctxUf2FileUri) {return;} // should never happen
                    progress.report({ increment: 20 });
                    try {
                        await vscode.workspace.fs.copy(ctxUf2FileUri, destUri, { overwrite: true });
                    } catch (error: any) {
                        // Special handling for macOS EIO error when copying UF2
                        if (os.platform() === 'darwin' && error?.message.includes('EIO')) {
                            vscode.window.showWarningMessage(
                                'UF2 file upload likely succeeded, but the board ejected before the copy completed. This is expected on macOS. If your board reboots, the upload was successful.'
                            );
                            progress.report({ increment: 100, message: strgs.uf2LoadingUf2copySuccess });
                            return;
                        } else if(os.platform() === 'linux' && error?.message.includes('ENODEV')) {
                            vscode.window.showWarningMessage(
                                'UF2 file upload likely succeeded, but the board ejected before the copy completed. This is expected on Linux. If your board reboots, the upload was successful.'
                            );
                            progress.report({ increment: 100, message: strgs.uf2LoadingUf2copySuccess });
                            return;
                        } else {
                            vscode.window.showErrorMessage(strgs.uf2LoadingUf2copyFail(this.getErrorMessage(error)));
                            return;
                        }
                    }
                    progress.report({ increment: 100, message: strgs.uf2LoadingUf2copySuccess });
                    vscode.window.showInformationMessage(strgs.uf2LoadingUf2copySuccess);
                });
                return;
            }
            // ** did not come in from a context click, proceed normally
            // now search for the board- start with low threshold
            let srchThreshold = this.boardSearchThresholdLow;
            let matchedBoards:cpBoardPick[]=[];
            let startManualSearch:boolean=false;    // ** may need to bail to manual search if too many results here
            // ** now search using the uf2 info, including board model and id
            const uf2infoSearch=boardModelFromUf2Info+(boardIdFromUf2Info ? "|'"+boardIdFromUf2Info : '');
            try {
                matchedBoards=this.matchBoardsFromCpOrg(uf2infoSearch,true);
            } catch (error) {
                vscode.window.showErrorMessage(this.getErrorMessage(error));
                startManualSearch=true;
            }
            // if no boards just skip to manual search
            if(matchedBoards.length===0){
                vscode.window.showWarningMessage(strgs.uf2LoadingBoardSearchNoneFound);
                startManualSearch=true;
            }
            /*
            while(matchedBoards.length===0 && srchThreshold <= this.boardSearchThresholdHigh) {
                const fuse = new Fuse(this._cpSiteBoards, {
                    keys: [
                        {name:'data-id',weight:2},
                        {name:'data-name',weight:2},
                        {name:'data-manufacturer'},
                        {name:'data-mcufamily'}
                    ],
                    threshold: srchThreshold,
                    includeScore: true,
                    useExtendedSearch: true
                });
                
                const result = fuse.search(boardModelFromUf2Info+(boardIdFromUf2Info ? "|'"+boardIdFromUf2Info : ''));
                if (result.length > 0) {
                    //const matchedBoard = result[0].item;
                    result.sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).forEach((res) => {
                        //matchedBoards.push(res.item['data-name']+'('+res.item['data-id']+')');
                        matchedBoards.push({label: res.item['data-name'],boardId:res.item['data-id'],description: res.item['data-id']});
                    });
                    vscode.window.showInformationMessage(`Found matching boards for Model ${boardModelFromUf2Info}: ${matchedBoards.join(', ')}`);
                    break; // exit while loop
                } else {
                    vscode.window.showWarningMessage(`No matching board found for: ${boardModelFromUf2Info} for threshold: ${srchThreshold}`);
                    srchThreshold += 0.1; // Increase threshold and try again
                }
            }
            if(matchedBoards.length===0){
                vscode.window.showErrorMessage(`No matching boards found for Model ${boardModelFromUf2Info}`);
                return;
            }
            */

            // ** if got list of boards give a pick list, with buttons
            let selectedBoard:cpBoardPick|undefined=undefined;
            // might have bailed earlier to manual, if so skip this
            if(!startManualSearch && matchedBoards.length>0){
                const resultWbutton=await showFullQuickPick(
                    {
                        items:matchedBoards,
                        title: strgs.uf2LoadingMatchedBoardPickTitle(boardModelFromUf2Info),
                        placeholder: strgs.uf2LoadingMatchedBoardPickPlaceholder,
                        buttons:[searchButton,helpButton],
                        shouldResume: shouldResume,
                        ignoreFocusOut:true,
                    }
                );
                if(resultWbutton && isCmdQuickInputButton(resultWbutton)){ 
                    if(resultWbutton.commandName==='help'){
                        // ** #72, open the help page
                        vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpUploadingUf2);
                        return;	
                    }
                    if(resultWbutton.commandName==='search'){
                        // ** go into a manual search
                        startManualSearch=true;
                    }
                }
                if(resultWbutton && !isCmdQuickInputButton(resultWbutton)){
                    selectedBoard=resultWbutton as cpBoardPick;
                } else {
                    selectedBoard=undefined;	//get out of this loop
                }
            }
            // ** if manual search, do a loop with an input box and a simple quick pick
            if (startManualSearch) {
                let _searchString:string='';
                while (true) {
                    const input = await vscode.window.showInputBox({
                        title:strgs.uf2LoadingManualSearchInpuTitle(boardModelFromUf2Info),
                        placeHolder: strgs.uf2LoadingManualSearchInputPlaceholder,
                        ignoreFocusOut: true
                    });
                    if (!input) {
                        if(input===''){
                            // blank input, just keep open
                            continue;
                        }
                        break; // cancel
                    }
                    // ** match the search term using simple search, but will limit with an error
                    _searchString=input;
                    try {
                        matchedBoards = this.matchBoardsFromCpOrg(input, false);
                    } catch (error) {
                        vscode.window.showWarningMessage(strgs.uf2LoadingManualSearchTooMany); //vscode.window.showErrorMessage(this.getErrorMessage(error));
                        startManualSearch = true;
                        continue;
                    }
                    if (matchedBoards.length === 0) {
                        vscode.window.showWarningMessage(strgs.uf2LoadingManualSearchNoneFound);
                        startManualSearch = true;
                        continue;
                    }
                    selectedBoard = await vscode.window.showQuickPick<cpBoardPick>(matchedBoards, {
                        title: strgs.uf2LoadingManualSearchPickTitle( _searchString, boardModelFromUf2Info),
                        placeHolder: strgs.uf2LoadingManualSearchPickPlaceholder,
                        canPickMany: false,
                        ignoreFocusOut: true
                    });
                    if (selectedBoard) {
                        break;
                    }
                }
            }


            /*
            if(matchedBoards.length>0){
                selectedBoard = await vscode.window.showQuickPick<cpBoardPick>(matchedBoards, {
                    placeHolder: 'Select board that matches the UF2 info: '+boardModelFromUf2Info,
                    canPickMany: false,
                    ignoreFocusOut: true
                });
                if (selectedBoard) {
                    vscode.window.showInformationMessage(`You selected: ${selectedBoard.label}`);
                } else {
                    vscode.window.showWarningMessage('No board selected');
                }
            }
            */

            // **** got a board, ask for CP version
            let cpUf2Version:string|undefined='';
            if (selectedBoard) {
                cpUf2Version = await vscode.window.showInputBox({
                    placeHolder: strgs.uf2LoadingCpVersionInputPlaceholder,
                    prompt: strgs.uf2LoadingCpVersionInputPrompt,
                    ignoreFocusOut: true
                });
                if (cpUf2Version === undefined) {
                    return;
                } else if (cpUf2Version==='') {
                    try {
                        cpUf2Version = await this.getLatestCPTag();
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(strgs.uf2LoadingCpVersionInputFailedLatestCPTag);
                        cpUf2Version=''; // just set to empty to force user entry
                        return;
                    }
                }
                // ** now should have all we need to construct url for download, download and get uri of file
                let downloadUri:vscode.Uri|undefined=undefined;
                try{
                    downloadUri = await this.downloadUf2File(selectedBoard.boardId, cpUf2Version);
                }
                catch (error) {
                    vscode.window.showErrorMessage(strgs.uf2LoadingUf2DnldFail(this.getErrorMessage(error)));
                    return;
                }
                // ** now ask if want to keep upload the file, and optionally keep the file
                if(downloadUri) {
                    const ans=await vscode.window.showQuickPick([
                        { label: strgs.uf2LoadingUf2PickPicks[0] },
                        { label: strgs.uf2LoadingUf2PickPicks[1] },
                        { label: strgs.uf2LoadingUf2PickPicks[2]}
                    ],{
                        title: strgs.uf2LoadingUf2PickTitle(path.basename(downloadUri.fsPath)),
                        placeHolder: strgs.uf2LoadingUf2PickPlaceholder,
                        canPickMany: false,
                        ignoreFocusOut: true
                    });
                    if(ans) {
                        if(ans.label.startsWith('Upload')) {
                            // ** do the upload by copying the file to the drive path
                            let baseUri=this._uf2drivepath;
                            if (os.platform()==='win32') {
                                baseUri='file:'+baseUri;
                            }
                            //const destUri=vscode.Uri.parse(baseUri+'/'+path.basename(downloadUri.fsPath));
                            const destUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),path.basename(downloadUri.fsPath));
                            await vscode.window.withProgress({
                                location: vscode.ProgressLocation.Notification,
                                title: strgs.uf2LoadingUf2CopyProgressTitle,
                                cancellable: false
                            }, async (progress) => {
                                progress.report({ increment: 20 });
                                try {
                                    await vscode.workspace.fs.copy(downloadUri, destUri, { overwrite: true });
                                } catch (error: any) {
                                    // Special handling for macOS EIO error when copying UF2
                                    if (os.platform() === 'darwin' && error?.message.includes('EIO')) {
                                        vscode.window.showWarningMessage(
                                            'UF2 file upload likely succeeded, but the board ejected before the copy completed. This is expected on macOS. If your board reboots, the upload was successful.'
                                        );
                                        progress.report({ increment: 100, message: strgs.uf2LoadingUf2copySuccess });
                                        return;
                                    } else if(os.platform() === 'linux' && error?.message.includes('ENODEV')) {
                                        vscode.window.showWarningMessage(
                                            'UF2 file upload likely succeeded, but the board ejected before the copy completed. This is expected on Linux. If your board reboots, the upload was successful.'
                                        );
                                        progress.report({ increment: 100, message: strgs.uf2LoadingUf2copySuccess });
                                        return;
                                    } else {
                                        vscode.window.showErrorMessage(strgs.uf2LoadingUf2copyFail(this.getErrorMessage(error)));
                                        return;
                                    }
                                }
                                progress.report({ increment: 100, message: strgs.uf2LoadingUf2copySuccess });
                                vscode.window.showInformationMessage(strgs.uf2LoadingUf2copySuccess);
                            });
                            //vscode.window.showInformationMessage(strgs.uf2LoadingUf2copySuccess);
                        }
                        if(ans.label.includes('Delete')) {
                            // ** do the delete
                            try {
                                await vscode.workspace.fs.delete(downloadUri);
                            } catch (error) {
                                vscode.window.showErrorMessage( strgs.uf2LoadingUf2DeleteFail(this.getErrorMessage(error)));
                            }
                        }
                        if(ans.label.includes('Cancel')) {
                            // ** do the cancel, leave the file
                            return;
                        }
                    }
                }
            }
        });
        context.subscriptions.push(cmdUploadUf2);
    }
    //-----------------------------------------------------------
    //public functions

    //-----------------------------------------------------------
    //private functions

    // Function to fetch HTML content from a website
    private async fetchWebsiteHTML(url: string): Promise<string> {
        try {
            // Make an HTTP GET request using Axios
            const response = await axios.default.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)', // Set a User-Agent header
                    'Accept': 'text/html', // Specify that we want HTML content
                },
            });

            // Return the HTML content as a string
            return response.data;
        } catch (error) {
            let errorMessage = strgs.uf2LoadingCpOrgFetchFail;
            // Handle errors (e.g., network issues, invalid URL, etc.)
            if (axios.isAxiosError(error)) {
                console.error('Axios error:', error.message);
                errorMessage += error.message;
            } else {
                console.error(strgs.uf2LoadingCpOrgFetchError+':', error);
                errorMessage += strgs.uf2LoadingCpOrgFetchError;
            }
            throw new Error(errorMessage);
        }
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

    private parseCpBoards(htmlContent: string): void {
        let boards: cpboards[] = [];
        const parser = new Parser({
                onopentag(name, attributes) {
                    if (name === 'div' && attributes['class'] === 'download') {
                        boards.push({
                        "data-id": attributes['data-id'],
                        "data-name": attributes['data-name'],
                        "data-manufacturer": attributes['data-manufacturer'],
                        "data-mcufamily": attributes['data-mcufamily']
                    });
                }
            }
        });
        parser.write(htmlContent);
        parser.end();
        if(boards.length > 0) {
            this._cpSiteBoards = boards;
        }   
    }

    private async showUf2DriveInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt,promptLooking,promptFound, validate, buttons, ignoreFocusOut, placeholder,placeholderLooking,placeholderFound, shouldResume }: P) {
		const disposables: Disposable[] = [];
        // ** use abortcontroller to be able to cancel drive search
        const abortController = new AbortController();
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>(async (resolve, reject) => {
				const input = vscode.window.createInputBox();
				input.title = title;
                if(totalSteps > 1){
                    input.step = step;
                    input.totalSteps = totalSteps;
                }
				input.value = value || '';
                // ** first will look for drive
				//input.prompt = prompt;
                input.prompt = promptLooking;
				input.ignoreFocusOut = ignoreFocusOut ?? false;
				//input.placeholder = placeholder;
                input.placeholder=placeholderLooking;
				input.buttons = [
					...(totalSteps > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
                            if(input.busy){
                                abortController.abort();
                            }
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
                            input.hide();
							resolve(item as any);
						}
					}),
					input.onDidAccept(async () => {
                        // ** if just an Enter while looking, treat like a cancel
                        if(input.busy){
                            abortController.abort();
                            if(!input.value || input.value.trim()===''){return;}
                        }
						const value = input.value;
						input.enabled = false;
						input.busy = true;
                        const validationMessage=await validate(value);
						if (!validationMessage) {
                            input.hide();
							resolve(value);
						}
                        // show validation message and prompt to enter again, NO MORE LOOKING
                        input.validationMessage = validationMessage;
                        input.prompt=prompt;
                        input.placeholder=placeholder;
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
                        // don't call validate, don't need to check path every key stroke, just look for empty
						// const current = validate(text);
						// validating = current;
						// const validationMessage = await current;
                        if(input.busy){
                            abortController.abort();
                        }
                        if (text.trim() === '') {
							input.validationMessage = strgs.uf2LoadingDriveInputValidateInputEmpty;
						} else {
                            input.validationMessage = undefined;
                        }
                        // else if (current === validating) {
						// 	input.validationMessage = validationMessage;
						// }
					}),
					input.onDidHide(() => {
                        resolve('');
						// (async () => {
						// 	reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						// })()
						// 	.catch(reject);
					})
				);
				if (this._currentUI) {
					this._currentUI.dispose();
				}
				this._currentUI = input;
                // ** MOCK looking for drive
                input.busy = true;
                //input.enabled=false;
				input.show();
                // ####MOCK- trying to find drive drive #####
                //await new Promise(resolve => setTimeout(resolve, 4000));
                const [path, infoFileName,aborted] = await this.searchForUf2Drive(abortController.signal);
                input.busy = false;
                input.enabled=true;
                if(path!=='' && !aborted) {
                    // ** found drive
                    this._uf2drivepath = path;
                    input.value = this._uf2drivepath;
                    this._uf2infofilename=  infoFileName;   // ** NOTE THAT IF CHANGED THIS NEEDS TO BE RESET
                    input.prompt = promptFound;
                    input.placeholder = placeholderFound;
                } else {
                    // ** did not find drive
                    if(!aborted) {input.value='';}   //this preserves character typed to abort
                    this._uf2drivepath = '';
                    this._uf2infofilename = '';
                    if(!aborted) {input.validationMessage=strgs.uf2LoadingDriveInputValidateTimeout;}
                    input.prompt=prompt;
                    input.placeholder=placeholder;
                }

			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

    // ** search for the uf2 drive with timeout
    // ** the return is [path,info_uf2.txt exact name]
    // ** make this abort-able from the input box, return flag if aborted
    private async searchForUf2Drive(signal?:AbortSignal): Promise<[string,string,boolean]> {
        return new Promise(async (resolve) => {
            // ** this is the overall wait for detection
            // need flag to say timer is running
            let timerRunning = true;
            const timer = setTimeout(() => {
                timerRunning = false;
                resolve(['', '', false]); // Timeout reached, resolve with empty string);
            }, this._driveSearchTimeout);
            // function to check the abort signal
            const checkAbort = () => {
                if (signal?.aborted) {
                    clearTimeout(timer);
                    resolve(['', '', true]); // Abort reached, resolve with empty string
                    return true;
                }
                return false;
            };
            // *** now repeat the drive search every second until found or main times out
            while(true){
                // ** look for the abort
                if(checkAbort()) {break;}
                // also if timer ran out, it resolved, just get out
                if(!timerRunning) {break;}
                // ** list the drives and see if any (first?) have uf2 info file
                let detectedPathsRemovable: string[] = [];	//this is for checking first
                let detectedPathsNotRemovable: string[] = [];
                const drives:drivelist.Drive[] = await drivelist.list();
                for (const drv of drives) {
                    if(drv.mountpoints.length>0) {
                        let drvPath:string=drv.mountpoints[0].path;
                        //if windows remove backslashes
                        if(os.platform()==='win32') {
                            drvPath=drvPath.replace(/\\/g,'');
                        }
                        if(drvPath){
                            // logic here is to add removable drives to list first, then non-removable
                            //  ** really nothing else uniquely identifies drives in bootloader mode!!
                            if(drv.isRemovable) {
                                detectedPathsRemovable.push(drvPath);
                            } else {
                                detectedPathsNotRemovable.push(drvPath);
                            }
                        }
                    }
                }
                const detectedPaths = [...detectedPathsRemovable, ...detectedPathsNotRemovable];
                for (const drvPath of detectedPaths) {
                    let baseUri=drvPath;
                    if (os.platform()==='win32') {
                        baseUri='file:'+baseUri;
                    }
                    // ** need to detect error here in case of permissions issues
                    let foundInfoFile:[string,vscode.FileType]|undefined=undefined;
                    try {
                        const dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
                        foundInfoFile=dirContents.find((value:[string,vscode.FileType],index,ary) => {
                            if(value.length>0){
                                return value[0].toLowerCase()==='info_uf2.txt';
                            } else {
                                return false;
                            }
                        });
                    } catch (error) {
                        console.log(strgs.uf2LoadingDriveSearchError(drvPath));
                        continue;
                    }
                    // ** if found info file short circuit out with result!
                    if(foundInfoFile) {
                        clearTimeout(timer);
                        resolve([drvPath, foundInfoFile[0], false]);
                    }
                }
                // if here, just delay a bit and do again
                await new Promise(resolve => setTimeout(resolve, 750));
                // ??? check abort again here?
            }

            // Simulate drive search
            // setTimeout(() => {
            //     clearTimeout(timer);
            //     resolve(['/media/bootloader','INFO_UF2.TXT']);
            // }, 5000);
        });
    }

    private async getLatestCPTag(): Promise<string> {
        let r: axios.AxiosResponse = await axios.default.get(
            strgs.libCPAdafruitUrlLatest,
            { headers: { Accept: "application/json" } }
        );
        return await r.data.tag_name;
    }

    private async downloadUf2File( boardId: string, cpVersion:string): Promise<vscode.Uri|undefined> {
        // returns path to the downloaded zip file
        const _boardId=boardId.trim();
        const _cpVersion=cpVersion.trim();
        const downloadUrl=strgs.uf2LoadingUf2DnldUrl(_boardId,_cpVersion);
        const dnldFileName=strgs.uf2LoadingUf2DnldFilename(_boardId,_cpVersion);
        const dnldPathUri=vscode.Uri.joinPath(this._workspaceUri!,dnldFileName);
        try {
            const response = await axios.default({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream'
            });
            response.data.pipe(fs.createWriteStream(dnldPathUri.fsPath));
    
            return new Promise((resolve, reject) => {
                response.data.on('end', () => {
                    resolve(dnldPathUri);
                });
    
                response.data.on('error', (err: any) => {
                    reject(err);
                });
            });
        } catch (error) {
            console.error(strgs.uf2LoadingUf2DnldError(this.getErrorMessage(error)));
            throw error;
        }
    }

    // ** try to match a search string from uf2 file or manual entry to boards from cp.org in this._cpSiteBoards
    // ** returns array of matching board picks or empty array if none found
    //  iterates from low match threshold (most specific match) to highest (least specific) trying to find
    // ** throws an error if result set length > this._maxBoardSearchResults
    private matchBoardsFromCpOrg(searchString: string, extendedSearch:boolean): cpBoardPick[] {
        let matchedBoards: cpBoardPick[] = [];
        let srchThreshold = this.boardSearchThresholdLow;
        // create template for fuse options
        const fuseOptions={
            keys: [
                {name:'data-id',weight:2},
                {name:'data-name',weight:2},
                {name:'data-manufacturer'},
                {name:'data-mcufamily'}
            ],
            threshold: srchThreshold,
            includeScore: true
        };
        if(extendedSearch) {
            Object.assign(fuseOptions, {useExtendedSearch: true});
        }
        // now loop through thresholds looking for matches
        while(matchedBoards.length===0 && srchThreshold <= this.boardSearchThresholdHigh) {
            fuseOptions.threshold = srchThreshold;
            const fuse = new Fuse(this._cpSiteBoards, fuseOptions);
            const result = fuse.search(searchString);
            if (result.length > 0) {
                //const matchedBoard = result[0].item;
                result.sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).forEach((res) => {
                    //matchedBoards.push(res.item['data-name']+'('+res.item['data-id']+')');
                    matchedBoards.push({label: res.item['data-name'],boardId:res.item['data-id'],description: res.item['data-id']});
                });
                if(matchedBoards.length > this._maxBoardSearchResults) {
                    throw new Error(`Too many matching boards found for search ${searchString}: ${matchedBoards.length}`);
                }
                //vscode.window.showInformationMessage(`Found matching boards for search ${searchString}: ${matchedBoards.join(', ')}`);
                break; // exit while loop
            } else {
                //vscode.window.showWarningMessage(`No matching board found for: ${searchString} for threshold: ${srchThreshold}`);
                srchThreshold += 0.1; // Increase threshold and try again
            }
        }
        if(matchedBoards.length===0){
            //vscode.window.showErrorMessage(`No matching boards found for search ${searchString}`);
        }
        return matchedBoards;
    }

// ### END OF CLASS ###    
}
