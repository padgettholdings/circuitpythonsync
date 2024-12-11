// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

let statusBarItem1: vscode.StatusBarItem;
// current drive config
let curDriveSetting: string;

//define quick pick type for drive pick
interface drivePick extends vscode.QuickPickItem {
	path: string
}


function fromBinaryArray(bytes: Uint8Array): string {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
}

function getCurrentDriveConfig(): string {
	const curDriveConf=vscode.workspace.getConfiguration('circuitpythonsync');
	let curDrive=curDriveConf.get('drivepath','');
	//still can be null, coalesce to ''
	curDrive=curDrive ?? '';
	return curDrive;
}

async function updateStatusBarItem() {
	if(curDriveSetting===''){
		//no drive mapped, put error icon in text
		statusBarItem1.text='CPCopy $(error)';
		//and the right tooltip
		statusBarItem1.tooltip=new vscode.MarkdownString('**MUST MAP DRIVE FIRST**');
	} else {
		//check to see if boot_out.txt is there, warn if not
		let rel=new vscode.RelativePattern(vscode.Uri.parse(curDriveSetting),'boot_out.txt');
		//const srchPath=vscode.Uri.joinPath(vscode.Uri.parse(curDriveSetting),'boot_out.txt');
		const fles=await vscode.workspace.findFiles(rel);
		if(fles.length===0) {
			statusBarItem1.text='CPCopy $(warning)';
			//and the right tooltip
			statusBarItem1.tooltip=new vscode.MarkdownString('**NOTE that boot_out.txt not found**');
		} else {
			statusBarItem1.text='CPCopy';
			statusBarItem1.tooltip='Enabled to copy to '+curDriveSetting;
		}
	}
	//?? do we do show here??
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
		//if don't have drive can't copy
		if(curDriveSetting==='') {
			vscode.window.showInformationMessage('!! Must set drive before copy !!');
		} else {
			vscode.window.showInformationMessage('**** copy done ****');
			statusBarItem1.backgroundColor=undefined;
		}
	});
	
	context.subscriptions.push(sbItemCmd);

	//get the initial drive setting, save for button setup
	curDriveSetting=getCurrentDriveConfig();
	//????? save in ext state?
	//context.subscriptions.push(curDriveSetting);

	//create the status bar button
	statusBarItem1= vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
	statusBarItem1.command=button1Id;
	updateStatusBarItem();
	//statusBarItem1.text='CPCopy';
	//if(curDriveSetting===''){statusBarItem1.color='#444444';}
	context.subscriptions.push(statusBarItem1);
	//show the status bar item
	statusBarItem1.show();

	//command to get drive using open file dialog -- NOW it tries to find CP drive first
	const fileCmd=vscode.commands.registerCommand('circuitpythonsync.opendir', async () => {
		// TBD- get drivelist, but for now fake it
		/*
		let picks: drivePick[]= [
			{
				path:'/media',
				label: '/media',
				description: ''
			},
			{
				path:'/etc',
				label: '/etc',
				description: ''
			},
			{
				path:'',
				label: 'Pick Manually',
				description: ''
			}
		];
		*/
		//get option for currently saved uri
		let curDrive=getCurrentDriveConfig();
		let picks: drivePick[] = [
			{
				path:'',
				label: 'Pick Manually',
				description: ''
			}
		];
		//FAKE this is the "detected" drive
		const mappedDrive:drivePick={
			path:'/media/stan',
			label:'/media/stan',
			description:'',
			detail: '           $(debug-disconnect) Auto Detected'
		};
		picks.unshift(mappedDrive);
		if(curDrive!==mappedDrive.path) {
			picks.unshift(
				{
					path: curDrive,
					label: curDrive,
					description: ''
				}
			);
		}
		//look to see if one of the picks is the curDrive
		if(curDrive!=='') {
			picks.forEach(pick => {
				if(pick.path===curDrive){
					pick.description='   (Current)';
				}
			});
		}
		// const result=await vscode.window.showQuickPick(['/media','/etc','Pick Manually'],{
		// 	placeHolder:'Pick detected drive or select manually',
		// 	title: 'CP Drive Select'
		// });
		const result=await vscode.window.showQuickPick<drivePick>(picks,{
			placeHolder:'Pick detected drive or select manually',
			title: 'CP Drive Select'
		});
		if(result) {vscode.window.showInformationMessage(result.label);};
		//if no choice just get out
		if(!result){return;}
		//if no change, just get out
		if(result && result.path===curDrive) {return;}
		//otherwise if selected detected drive, just update config, else open file dialog
		if(result.path!=='') {
			vscode.workspace.getConfiguration().update('circuitpythonsync.drivepath',result.path);
			//set the status bar text to active and save setting locally
			curDriveSetting=result.path;
			//statusBarItem1.color=undefined;
			updateStatusBarItem();
		} else {
			const opts: vscode.OpenDialogOptions={
				canSelectFiles:false,
				canSelectFolders:true,
				canSelectMany:false,
				defaultUri: curDrive==='' ? vscode.Uri.parse('/') : vscode.Uri.parse(curDrive),
				title: 'Pick drive or mount point for CP'
				};
			const dirs=await vscode.window.showOpenDialog(opts);
			if(dirs){
				vscode.window.showInformationMessage('selected: '+dirs[0].fsPath);
				//save the config
				vscode.workspace.getConfiguration().update('circuitpythonsync.drivepath',dirs[0].fsPath);
				//set the status bar text to active and save setting locally
				curDriveSetting=dirs[0].fsPath;
				//statusBarItem1.color=undefined;
				updateStatusBarItem();
			} else {
				// ??? leave the status bar color as is??
			}
		}
		statusBarItem1.show();
	});

	// look for config change
	const cfgChg=vscode.workspace.onDidChangeConfiguration(async (event) => {
		//see if the drivepath changed
		if (event.affectsConfiguration('circuitpythonsync.drivepath')) {
			const curDrive=getCurrentDriveConfig();
			if (curDriveSetting!==curDrive) {
				curDriveSetting=curDrive;
				updateStatusBarItem();
				// if(curDrive===''){
				// 	statusBarItem1.color='#444444';
				// } else {
				// 	statusBarItem1.color=undefined;
				// }
				statusBarItem1.show();
			}
		}
	});
	context.subscriptions.push(cfgChg);

	//show info if text doc changed
	const txtChg=vscode.workspace.onDidSaveTextDocument(async (event) => {
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
				//statusBarItem1.color='#fbc500';
				statusBarItem1.backgroundColor=new vscode.ThemeColor('statusBarItem.warningBackground');
				updateStatusBarItem();
				//also need to set text color properly for drive map
				//if(curDriveSetting===''){statusBarItem1.color='#00FF00';}
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
				//statusBarItem1.color='#fbc500';
				statusBarItem1.backgroundColor=new vscode.ThemeColor('statusBarItem.warningBackground');
				updateStatusBarItem();
				//also need to set text color properly for drive map
				//if(curDriveSetting===''){statusBarItem1.color='#444444';}
			} else {
				msg='cpfiles.txt NOT found, code.py WAS NOT the changed file';
			}
			vscode.window.showInformationMessage(msg);
			statusBarItem1.show();
		}
	});
	context.subscriptions.push(txtChg);
}

// This method is called when your extension is deactivated
export function deactivate() {}
