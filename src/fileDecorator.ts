import * as vscode from 'vscode';
import * as strgs from './strings';

export class FileDecorator implements vscode.FileDecorationProvider {
    private _fileUrisToDecorate: vscode.Uri[] = [];
    // ** add set of folder decorations to show contains
    private _folderUrisToDecorate: vscode.Uri[] = [];

    constructor(context: vscode.ExtensionContext){
        // init an array to hold file uris to decorate as being copied
        this._fileUrisToDecorate = [];
        // init an array to hold folder uris to decorate as containing copied files
        this._folderUrisToDecorate = [];
        // Register the file decoration provider
        context.subscriptions.push(
            vscode.window.registerFileDecorationProvider(this)
        );
    }

    private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

    // Method to refresh the decorations - ** files 
    public refresh(fileUris:vscode.Uri[]): void {
        // save copy of previous set of decorated uris
        const previousDecoratedUris = [...this._fileUrisToDecorate];
        // now clear the set and let the provider erase the decorations
        this._fileUrisToDecorate = [];
        this._onDidChangeFileDecorations.fire(previousDecoratedUris);
        // add the new uris to the set
        this._fileUrisToDecorate.push(...fileUris);
        // fire the event to update the decorations
        this._onDidChangeFileDecorations.fire(fileUris);
    }
    public refreshFolders(fileUris:vscode.Uri[]): void {
        // save copy of previous set of decorated uris
        const previousDecoratedUris = [...this._folderUrisToDecorate];
        // now clear the set and let the provider erase the decorations
        this._folderUrisToDecorate = [];
        this._onDidChangeFileDecorations.fire(previousDecoratedUris);
        // add the new uris to the set
        this._folderUrisToDecorate.push(...fileUris);
        // fire the event to update the decorations
        this._onDidChangeFileDecorations.fire(fileUris);
    }

    provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FileDecoration> {
        // Check if the uri is in the set of uris to decorate... first files
        if (this._fileUrisToDecorate.some(decoratedUri => decoratedUri.toString() === uri.toString())) {
        //if (uri.path.endsWith("code.py")) {
            return {
                badge: strgs.fileDecoratorBadge,
                tooltip: strgs.fileDecoratorTooltip,
                color: new vscode.ThemeColor(strgs.fileDecoratorColor), // Cyan color
            };
        }
        // Check if the uri is in the set of uris to decorate... now folders
        if (this._folderUrisToDecorate.some(decoratedUri => decoratedUri.toString() === uri.toString())) {
            return {
                badge: strgs.fileDecoratorBadgeFolder,
                tooltip: strgs.fileDecoratorTooltipFolder,
                color: new vscode.ThemeColor(strgs.fileDecoratorColorFolder), // Green color
            };
        }
        // For other files, return undefined
        return undefined;
    }    
}