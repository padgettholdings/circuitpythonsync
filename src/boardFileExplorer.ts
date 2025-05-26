import * as vscode from 'vscode';
import * as os from 'os';
import { getCurrentDriveConfig,getLibPath } from './extension';
import { toNamespacedPath } from 'path';
import * as strgs from './strings';

/*
interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
}
*/
export class Entry extends vscode.TreeItem{
	constructor(
		public readonly uri:vscode.Uri,
		public readonly type:vscode.FileType,
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label,collapsibleState);
		this.uri=uri;
		this.type=type;
	}
	contextValue = 'entry';
}

export class BoardFileProvider implements vscode.TreeDataProvider<Entry> {
    _CurDriveSetting: string;
    
    constructor(curDriveSetting:string){
        this._CurDriveSetting=curDriveSetting;
    }
    // tree data provider
	private _onDidChangeTreeData: vscode.EventEmitter<Entry | undefined | void> = new vscode.EventEmitter<Entry | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Entry | undefined | void> = this._onDidChangeTreeData.event;

	refresh(curDriveSetting:string): void {
		this._CurDriveSetting=curDriveSetting;
		this._onDidChangeTreeData.fire();
	}


	async getChildren(element?: Entry): Promise<Entry[]> {
		if (element) {
            // #######TBD####### point at board mapping
			const children = await vscode.workspace.fs.readDirectory(element.uri);
			//return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
			return children.map(([name,type]) => ({uri:vscode.Uri.joinPath(element.uri,name),type,label:'',
				collapsibleState:vscode.TreeItemCollapsibleState.None, contextValue:'entry'}));
		}
		//const workspaceFolder = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file')[0];
		let baseUri=this._CurDriveSetting;
		if (os.platform()==='win32') {
			baseUri='file:'+baseUri;
		}
		let gotCpDirectory:boolean=false;
		let children:[string,vscode.FileType][]=Array<[string,vscode.FileType]>(0);
		try {
			children=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
			gotCpDirectory=true;
		} catch {gotCpDirectory=false;}
		if(!gotCpDirectory || this._CurDriveSetting===''){
			return Array<Entry>(0);
		}
		children.sort((a, b) => {
			if (a[1] === b[1]) {
				return a[0].localeCompare(b[0]);
			}
			return a[1] === vscode.FileType.Directory ? -1 : 1;
		});
		return children.map(([name,type]) => ({uri:vscode.Uri.joinPath(vscode.Uri.parse(baseUri),name),type,label:'',
			collapsibleState:vscode.TreeItemCollapsibleState.None, contextValue:'entry'}));
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri,
			 element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (element.type === vscode.FileType.File) {
			treeItem.command = { command: 'fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
			treeItem.contextValue = 'file';
		} else {
			treeItem.contextValue = 'folder';
		}
		return treeItem;
	}

}

export class BoardFileExplorer {
	boardFileProvider:BoardFileProvider;
    constructor(context: vscode.ExtensionContext,curDriveSetting:string) {
        this.boardFileProvider=new BoardFileProvider(curDriveSetting);
		const tvo:vscode.TreeViewOptions<Entry>={
			treeDataProvider:this.boardFileProvider,
			showCollapseAll:true
		};
        context.subscriptions.push(vscode.window.createTreeView('boardExplorer',tvo));
		vscode.commands.registerCommand('boardExplorer.refresh', () => {
			const _curDrive=getCurrentDriveConfig();
			this.boardFileProvider.refresh(_curDrive);
		});
		vscode.commands.registerCommand('fileExplorer.openFile', (resource) => {});
		vscode.commands.registerCommand('boardExplorer.delete', async (resource:Entry) => { 
			// ** #36, make sure uri exists and confirm every delete
			let ftype:vscode.FileType;
			try {
				const fstat=await vscode.workspace.fs.stat(resource.uri);
				ftype=fstat.type;
			} catch(error) {
				const fse:vscode.FileSystemError=error as vscode.FileSystemError;
				vscode.window.showErrorMessage(strgs.boardFileDeleteError+fse.message);
				return;
			}
			const ans=await vscode.window.showWarningMessage(strgs.boardFileConfDelete,"Yes","No, cancel");
			if(ans==="No, cancel") {return;}
			// check the node type, need to do differently
			if(ftype===vscode.FileType.File){
				try{
					await vscode.workspace.fs.delete(resource.uri);
					this.boardFileProvider.refresh(curDriveSetting);
				} catch(error) {
					const fse:vscode.FileSystemError=error as vscode.FileSystemError;
					vscode.window.showErrorMessage(strgs.boardFileDeleteError+fse.message);	
				}
			} else if(ftype===vscode.FileType.Directory){
				// ** should not get here
				//await vscode.commands.executeCommand("remote-wsl.revealInExplorer",resource.uri);
			} else {
				vscode.window.showErrorMessage(strgs.boardUnkTypeFileFolder);
			}
		});
		vscode.commands.registerCommand('boardExplorer.filednld', async (resource:Entry) => {
			const _vscode = vscode;
			const _strgs = strgs;
			const _os = os;
			// ** #36, make sure uri exists and confirm every delete
			let ftype:vscode.FileType;
			try {
				const fstat=await _vscode.workspace.fs.stat(resource.uri);
				ftype=fstat.type;
			} catch(error) {
				const fse:vscode.FileSystemError=error as vscode.FileSystemError;
				_vscode.window.showErrorMessage(_strgs.boardFileDnldError+fse.message);
				return;
			}
			// can only download files, should be filtered by when in manifest but to double check
			if(ftype!==vscode.FileType.File){return;}
			// Now check to see if will overwrite in workspace, get filename first
			let baseUri=curDriveSetting;
			// if windows, need to use lowercase for getting filename
			let resourcePath:string=resource.uri.fsPath;
			if (_os.platform()==='win32') {
				resourcePath=resourcePath.toLowerCase();
				baseUri=baseUri.toLowerCase();
			}
			let dnldFile:string=resourcePath.replace(baseUri,'');
			//_vscode.window.showInformationMessage("resourcePath:"+resourcePath+", baseuri:"+baseUri+", dnldFile: "+dnldFile);
			if(dnldFile.startsWith('/') || dnldFile.startsWith('\\')){
				dnldFile=dnldFile.slice(1);
			}
			// normalize the path to use forward slashes only on windows
			if (_os.platform()==='win32') {
				dnldFile=dnldFile.replace(/\\/g,'/');
			}
			const libPath=await getLibPath();
			if(libPath!=='' && dnldFile.toLowerCase().startsWith(libPath.toLowerCase()+'/')){
				_vscode.window.showErrorMessage(_strgs.boardFileDnldNoLibs);
				return;
			}
			// now check to see if file path exists in workspace
			const wsRootFolder=_vscode.workspace.workspaceFolders?.[0];
			if(!wsRootFolder) {return;}	//should not happen
			let wsDestUri=_vscode.Uri.joinPath(wsRootFolder.uri,dnldFile);
			// check if file exists
			let destExists:boolean=false;
			try{
				const fstat=await _vscode.workspace.fs.stat(wsDestUri);
				if(fstat.type===vscode.FileType.File){
					destExists=true;
				} else {
					_vscode.window.showErrorMessage(_strgs.boardFileDnldDestNotFile);
					return;
				}
			} catch(error) {
				const fse:vscode.FileSystemError=error as vscode.FileSystemError;
				if(fse.code==='FileNotFound'){
					destExists=false;
				} else {
					_vscode.window.showErrorMessage(_strgs.boardFileDnldDestError+fse.message);
					return;
				}
			}
			// if exists, ask whether to overwrite or make a copy
			if(destExists){
				const ans=await _vscode.window.showWarningMessage(_strgs.boardFileDnldAskOverwrite,"Yes","No, make a copy", 'No, cancel');
				if(ans==="No, cancel") {return;}
				if(ans==="No, make a copy"){
					wsDestUri=_vscode.Uri.joinPath(wsRootFolder.uri,dnldFile+'.copy');
				}
			}
			await _vscode.workspace.fs.copy(resource.uri,wsDestUri,{overwrite:true});
		});
		vscode.commands.registerCommand('boardExplorer.openOS', async (resource:Entry) => {
			let rname=vscode.env.remoteName;
			let cmdName:string='revealFileInOS';
			if(rname && rname==='ssh-remote'){
				// use the terminal
				cmdName="openInIntegratedTerminal";			
			}
			await vscode.commands.executeCommand(cmdName,resource.uri);
		});
		vscode.commands.registerCommand('boardExplorer.openOS-wsl', async (resource:Entry) => {
			let rname=vscode.env.remoteName;
			await vscode.commands.executeCommand("remote-wsl.revealInExplorer",resource.uri);
		});
		vscode.commands.registerCommand('boardExplorer.openBoardOS', async () => {
			const rname=vscode.env.remoteName;
			let cmdName:string='revealFileInOS';
			if(rname && rname==='ssh-remote'){
				// use the terminal
				cmdName="openInIntegratedTerminal";			
			}
			if(rname && rname==='wsl'){
				cmdName="remote-wsl.revealInExplorer";
			}
			// ** now get the board path
			const _curDrive=getCurrentDriveConfig();
			let baseUri=_curDrive;	//  this.boardFileProvider._CurDriveSetting;
			if (os.platform()==='win32') {
				baseUri='file:'+baseUri;
			}
			const boardUri:vscode.Uri=vscode.Uri.parse(baseUri);
			await vscode.commands.executeCommand(cmdName,boardUri);
		});
		// ** #72, add help
		vscode.commands.registerCommand('boardExplorer.help', async () => {
			vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpBoardSupport);
    	});
	}
}