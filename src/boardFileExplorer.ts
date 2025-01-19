import * as vscode from 'vscode';

interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
}

export class BoardFileProvider implements vscode.TreeDataProvider<Entry> {
    _CurDriveSetting: string;
    
    constructor(curDriveSetting:string){
        this._CurDriveSetting=curDriveSetting;
    }
    // tree data provider

	async getChildren(element?: Entry): Promise<Entry[]> {
		if (element) {
            // #######TBD####### point at board mapping
			const children = await vscode.workspace.fs.readDirectory(element.uri);
			return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
		}

		const workspaceFolder = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file')[0];
		if (workspaceFolder) {
			const children = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
			children.sort((a, b) => {
				if (a[1] === b[1]) {
					return a[0].localeCompare(b[0]);
				}
				return a[1] === vscode.FileType.Directory ? -1 : 1;
			});
			return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, name)), type }));
		}

		return [];
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (element.type === vscode.FileType.File) {
			treeItem.command = { command: 'fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
			treeItem.contextValue = 'file';
		}
		return treeItem;
	}

}

export class BoardFileExplorer {
    constructor(context: vscode.ExtensionContext,curDriveSetting:string) {
        const boardFileProvider=new BoardFileProvider(curDriveSetting);
        context.subscriptions.push(vscode.window.createTreeView('boardExplorer',{boardFileProvider}));
    }
}