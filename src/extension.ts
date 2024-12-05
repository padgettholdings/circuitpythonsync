// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

let statusBarItem1: vscode.StatusBarItem;

function fromBinaryArray(bytes: Uint8Array): string {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "circuitpythonsync" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('circuitpythonsync.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello from CircuitPythonSync!');
	});
	context.subscriptions.push(disposable);

	const button1Id:string ='circuitpythonsync.button1';

	const sbItemCmd=vscode.commands.registerCommand(button1Id,() => {
		vscode.window.showInformationMessage('button 1 pushed');
		statusBarItem1.color='#00ff00';
	});
	
	context.subscriptions.push(sbItemCmd);

	//create the status bar button
	statusBarItem1= vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
	statusBarItem1.command=button1Id;
	statusBarItem1.text='CPCopy';
	statusBarItem1.color='#00ff00';
	context.subscriptions.push(statusBarItem1);
	//show the status bar item
	statusBarItem1.show();

	//show info if text doc changed
	const x=vscode.workspace.onDidSaveTextDocument(async (event) => {
		vscode.window.showInformationMessage('file changed: '+event.fileName);
		//see if cpfiles.txt is in .vscode dir
		const fles=await vscode.workspace.findFiles('**/.vscode/cpfiles.txt');
		if(fles.length>0){
			let msg:string = 'Found cpfiles.txt ';
			//vscode.window.showInformationMessage('Found cpfiles.txt');
			let fil=await vscode.workspace.fs.readFile(fles[0]);
			let sfil=fromBinaryArray(fil);
			//vscode.window.showInformationMessage('cpfiles.txt contents: '+sfil);
			msg=msg+' --- cpfiles.txt contents: '+sfil;
			const lines:string[]= sfil.split(/\n/);
			const foundEl=lines.find((el) => {
				let elNoWS:string = el.replace(/\s/g, "");
				if(!elNoWS){return false;}
				const fromTo:string[]=elNoWS.split('->');
				if (event.fileName.toLowerCase().endsWith(fromTo[0].toLowerCase())) {
					return true;
				} else {
					return false;
				}
			});
			if (foundEl){
				msg=msg+' --- found file '+event.fileName+' in cpfiles.txt';
				statusBarItem1.color='#fbc500';
			} else {
				msg=msg+' --- DID NOT FIND file '+event.fileName+' in cpfiles.txt';
			}
			vscode.window.showInformationMessage(msg);
			statusBarItem1.show();
		} else {
			let msg:string='';
			//check to see if just code.py was change
			if (event.fileName.toLowerCase().endsWith('code.py')) {
				msg='cpfiles.txt NOT found, code.py WAS the changed file';
				statusBarItem1.color='#fbc500';
			} else {
				msg='cpfiles.txt NOT found, code.py WAS NOT the changed file';
			}
			vscode.window.showInformationMessage(msg);
			statusBarItem1.show();
		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}
