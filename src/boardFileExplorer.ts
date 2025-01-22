import * as vscode from 'vscode';
import os from 'os';
import { toNamespacedPath } from 'path';

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
		if(!gotCpDirectory){
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
		vscode.commands.registerCommand('boardExplorer.refresh', () => this.boardFileProvider.refresh(curDriveSetting));
		vscode.commands.registerCommand('fileExplorer.openFile', (resource) => {});
		vscode.commands.registerCommand('boardExplorer.delete',(resource:Entry) => { 
			let x=resource;
		});
    }
}