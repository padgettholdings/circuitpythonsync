// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as drivelist from 'drivelist';
import os, { devNull } from 'os';
//#19, get strings
import * as strgs from './strings.js';

//import { arrayBuffer } from 'stream/consumers';
//import { error } from 'console';
//import { fstat } from 'fs';
//import { stringify } from 'querystring';
//import { CustomPromisifyLegacy } from 'util';
//import { validateHeaderValue } from 'http';
//import { validateHeaderValue } from 'http';

// ** strings that come from settings - defaults still in strings.ts **
let strgs_cpfiles:string=strgs.cpfiles;
let strgs_cpfilesbak:string=strgs.cpfilesbak;
let strgs_cpBootFile:string=strgs.cpBootFile;
let strgs_noWriteCpfile:string=strgs.noWriteCpfile;
let strgs_mngLibChooseLibs:string=strgs.mngLibChooseLibs;
let strgs_noCodeFilesInCp:string=strgs.noCodeFilesInCp;
let strgs_noPyCodeFilesInCp:string=strgs.noPyCodeFilesInCp;
let strgs_fileInCpNoExist:string=strgs.fileInCpNoExist;
let strgs_cpBootNoFindMKDN:string=strgs.cpBootNoFindMKDN;
let strgs_noPyAndNonExistFilesInCp:string=strgs.noPyAndNonExistFilesInCp;
let strgs_warnNoLibsInCP:string=strgs.warnNoLibsInCP;

//the statusbar buttons - this is CPCopy
let statusBarItem1: vscode.StatusBarItem;
//and this is lib
let statusBarItem2: vscode.StatusBarItem;

// current drive config
let curDriveSetting: string;
// need explicit flag to make sure workspace is set so can disable everythin
let haveCurrentWorkspace: boolean;
// track whether library folder is there or not
let libraryFolderExists: boolean;
// track whether py files exist that can be copied ???? needed ????
let pyFilesExist: boolean;
// and track whether lib files exist and can be copied
let libFilesExist: boolean;
// global to track whether entire lib copy should be confirmed or has been disabled
let confirmFullLibCopy: boolean;
// for download, track whether currently allowing overwrite and skipping dot files
let confirmDnldOverwrite:boolean;
let confirmDnldSkipDots:boolean;

//define quick pick type for drive pick
interface drivePick extends vscode.QuickPickItem {
	path: string
}

//need cache of drives from drivelist, first define type
interface drvlstDrive {
	drvPath: string;
	isUsb: boolean;
}

//now the last drives queried
let lastDrives:drvlstDrive[]=Array<drvlstDrive>(0);

//interface for cpfiles parsed line
interface cpFileLine {
	src: string,
	dest: string,
	inLib: boolean
}

// parse cpfiles.txt into lines
// schema is:
//	src | src->dest | lib/src | lib/src -> dest (dest in lib implied) | lib/src -> lib/dest
async function parseCpfiles(): Promise<cpFileLine[]>  {
	let outLines:cpFileLine[]=Array<cpFileLine>(0);
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return outLines;}
	const relPat=new vscode.RelativePattern(wsRootFolder,`.vscode/${strgs_cpfiles}`);
	const fles=await vscode.workspace.findFiles(relPat);
	if(fles.length>0){
		//cpfiles exists, read and split into lines
		let fil=await vscode.workspace.fs.readFile(fles[0]);
		let sfil=fromBinaryArray(fil);
		const lines:string[]= sfil.split(/\n/);
		let fromFile:string='';
		let toFile:string='';
		let inLib:boolean=false;
		if(lines) {
			for(const lineOrig of lines) {
				const fromTo:string[]=lineOrig.split('->');
				fromFile=fromTo[0].trim();
				toFile=fromTo.length>1 ? fromTo[1].trim() : '';
				inLib=fromFile.toLowerCase().startsWith('lib/');
				//go ahead and parse lib filenames/dirs if in lib
				if(inLib){
					fromFile=fromFile.replace(/[lL]ib\//,'');
					toFile=toFile.replace(/[lL]ib\//,'');
				}
				if(fromFile) {
					outLines.push(
						{
							src: fromFile,
							dest: toFile,
							inLib: inLib
						}
					);
				}
			}
		}
	}
	return outLines;
}

// ** write cpfiles.txt, creating if needed and making one level backup **
async function writeCpfiles(fileContents:string): Promise<string | undefined>{
	// ** should never call without workspace, this is just to get compiler to work **
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return "";}
	const relPat=new vscode.RelativePattern(wsRootFolder,`.vscode/${strgs_cpfiles}`);
	const fles=await vscode.workspace.findFiles(relPat);
	const cpFilePath:vscode.Uri=vscode.Uri.joinPath(wsRootFolder.uri,`.vscode/${strgs_cpfiles}`);
	const cpFilePathBkup:vscode.Uri=vscode.Uri.joinPath(wsRootFolder.uri,`.vscode/${strgs_cpfilesbak}`);
	if(!fles || fles.length===0){
		// ** NO, don't need to create explicitly, write will create, and .vscode has to exist
		//	because can't get here without drive mapping
		/*
		try{
			await vscode.workspace.fs.createDirectory(cpFilePath);
		} catch(error) {
			return "Could not create cpfiles.txt";
		}
		*/
	} else {
		//file existed, make the backup
		await vscode.workspace.fs.copy(cpFilePath,cpFilePathBkup,{overwrite:true});
	}
	//now write the file from contents, including blank file
	const bFil=toBinaryArray(fileContents);
	try{
		await vscode.workspace.fs.writeFile(cpFilePath,bFil);
	} catch(error) {
		return strgs_noWriteCpfile;
	}
	return "";
}

//helper type for return of file states
// ** per #26, add flags for no py files and filenames not existing
interface fileStates {
	pyExists: boolean,
	libExists: boolean,
	noPyFiles: boolean,
	filesNoExist: boolean
}

//determine if files from cpFilesLine[] exist in either root or lib folder
// ** should only call if have something in arg but will work, just always returns pyExists=false and libExists=true
// ** assumes libraryFolderExists has been set
// ** per #26, also looks in cplines to see if none of the non-lib files are .py, and whether any filenames no exist
async function checkSources(cpLines:cpFileLine[]):Promise<fileStates> {
	let retVal:fileStates={
		pyExists: false,
		libExists: false,
		noPyFiles: false,
		filesNoExist: false
	};
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return retVal;}
	//first the py (really any source) files in root
	const rootDir=await vscode.workspace.fs.readDirectory(wsRootFolder.uri);
	if(rootDir.length>0){
		const anyValidfilesInDir=cpLines.some((cpfle:cpFileLine,index,ary) => {
			return !cpfle.inLib && rootDir.some(dfile => dfile[0]===cpfle.src && dfile[1]===vscode.FileType.File);
		});
		// if got some non lib files, return flag that is used to say SOME valid files exist
		if(anyValidfilesInDir){
			retVal.pyExists=true;
		}
		//now check the files independently for #26 conditions
		const gotPyFile=cpLines.some(cpFileLine => !cpFileLine.inLib && cpFileLine.src.endsWith(".py"));
		if(!gotPyFile) { retVal.noPyFiles=true; }
		const allExist=cpLines.filter(lne => !lne.inLib).every((cpFileLine) => {
			return rootDir.some(dfile =>  dfile[0]===cpFileLine.src && dfile[1]===vscode.FileType.File);
		});
		if(!allExist) { retVal.filesNoExist=true; }

	}
	//now see if any files marked lib are in folder if it exists
	// BUT first see if any lib files are in lib folder OR if no lib files in cpfiles
	if(libraryFolderExists){
		//short circuit if no lib files in cpfiles, then "have" lib files, all of them!
		const gotLIbFiles=cpLines.some((lne:cpFileLine) => {
			return lne.inLib;
		});
		if(!gotLIbFiles) {
			retVal.libExists=true;
		} else {
			//the rootDir array should have lib folder name, find it
			const libName=rootDir.find((value:[string,vscode.FileType],index,ary) => {
				return value[1]===vscode.FileType.Directory && value[0].toLowerCase()==='lib';
			});
			if(libName) {
				//now read the lib directory, libName has proper case for path
				const libPath=vscode.Uri.joinPath(wsRootFolder.uri,libName[0]);
				const libDir=await vscode.workspace.fs.readDirectory(libPath);
				//see if any cpfile lib directories are in the lib dir, most likely, if not check files
				const dirsInDir=cpLines.some((cpfle:cpFileLine,index,ary) => {
					return cpfle.inLib && libDir.some(entry => entry[0]===cpfle.src && entry[1]===vscode.FileType.Directory);
				});
				if(dirsInDir){
					retVal.libExists=true;
				} else {
					const filesInDir=cpLines.some((cpfle:cpFileLine,index,ary) => {
						//NOTE can't use search object in includes, it is not the same object!!
						//const srch:[string,vscode.FileType]=[cpfle.src,vscode.FileType.File];
						//return cpfle.inLib && libDir.includes(srch);
						return cpfle.inLib && libDir.some(entry => entry[0]===cpfle.src && entry[1]===vscode.FileType.File);
					});
					if(filesInDir) {
						retVal.libExists=true;
					}
				}
			}
		}
	}
	return retVal;
}

//checked list interface for lib
interface libListSelect {
	src: string,
	dest: string,
	fullPath: string,
	selected: boolean,
	fType: vscode.FileType
}

// support #15, for library only, merge  parsed cpfiles with actual directory, returning checked list
async function getlibListSelect(cpLines:cpFileLine[]): Promise<libListSelect[]> {
	// **Only works if workspace, but should not ever call this if not one **
	let retVal:libListSelect[]=Array<libListSelect>(0);
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return retVal;}
	// ** also should not call if lib folder doesn't exist, but this is for safety
	if(!libraryFolderExists) { return retVal;}
	//first filter cpLines to only lib entries...
	// NOTE don't know if cpfiles exists at this point, check later
	const cpLinesLib=cpLines.filter(lne => lne.inLib);
	//the rootDir array should have lib folder name, find it
	const rootDir=await vscode.workspace.fs.readDirectory(wsRootFolder.uri);
	const libName=rootDir.find((value:[string,vscode.FileType],index,ary) => {
		return value[1]===vscode.FileType.Directory && value[0].toLowerCase()==='lib';
	});
	//libName must be there but for safety check it
	if(!libName) {return retVal;}
	//now read the lib directory, libName has proper case for path
	const libPath=vscode.Uri.joinPath(wsRootFolder.uri,libName[0]);
	const libDir=await vscode.workspace.fs.readDirectory(libPath);
	//now go through libDir, adding to output array and merging cpLinesLib
	for(const entry of libDir) {
		let curEntry:libListSelect={
			src:entry[0],
			dest:"",
			fullPath:libName[0]+"/"+entry[0],
			selected:false,
			fType:entry[1]
		};
		const matchedCp=cpLinesLib.find((value) => {
			return value.src===curEntry.src;
		});
		if(matchedCp){
			curEntry.dest=matchedCp.dest;
			curEntry.selected=true;
		}
		retVal.push(curEntry);
	}
	return retVal;
}

//refresh the drive list
async function refreshDrives() {
	//use a temp array in case of error
	let tmpLastDrives:drvlstDrive[]=Array<drvlstDrive>(0);
	try {
		const drives:drivelist.Drive[] = await drivelist.list();
		for(const drv of drives) {
			if(drv.mountpoints.length>0) {
				console.log(drv.mountpoints[0].path, 'isUsb? ',drv.isUSB);
				let drvPath:string=drv.mountpoints[0].path;
				//if windows remove backslashes
				if(os.platform()==='win32') {
					drvPath=drvPath.replace(/\\/g,'');
				}
				//add to array
				const tmpDrv:drvlstDrive={
					drvPath:drvPath,
					isUsb: drv.isUSB ?? false
				};
				tmpLastDrives.push(tmpDrv);
			}
		}
		//since no error replace the global cache with tmp
		lastDrives=tmpLastDrives;
	} catch {}
} 

function fromBinaryArray(bytes: Uint8Array): string {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
}

function toBinaryArray(str: string):Uint8Array {
	const encoder=new TextEncoder();
	return encoder.encode(str);
}

function getCurrentDriveConfig(): string {
	const curDriveConf=vscode.workspace.getConfiguration('circuitpythonsync');
	let curDrive=curDriveConf.get(strgs.confDrivepathPKG,'');
	//still can be null, coalesce to ''
	curDrive=curDrive ?? '';
	//if on windows, remove backslashes 
	if(os.platform()==='win32') {
		curDrive=curDrive.replace(/\\/g,'');
	}
	return curDrive;
}
// ** update both status bar buttons
async function updateStatusBarItems() {
	if(curDriveSetting===''){
		//no drive mapped, put error icon in text of both
		statusBarItem1.text=`${strgs.btnCopyLbl} $(error)`;
		statusBarItem2.text=`${strgs.btnLibLbl} $(error)`;
		//and the right tooltip
		statusBarItem1.tooltip=new vscode.MarkdownString(strgs.mustMapMKDN);
		statusBarItem2.tooltip=new vscode.MarkdownString(strgs.mustMapMKDN);
	} else {
		//NEXT see if have valid files to copy, if not show no sync
		//NOTE will need to short circuit further actions on these exists flags
		if(!pyFilesExist) {
			statusBarItem1.text=`${strgs.btnCopyLbl} $(sync-ignored)`;
			statusBarItem1.tooltip=new vscode.MarkdownString(strgs.noFilesMKDN);
		}
		if(!libFilesExist){
			statusBarItem2.text=`${strgs.btnLibLbl} $(sync-ignored)`;
			statusBarItem2.tooltip=new vscode.MarkdownString(strgs.noFilesMKDN);
		}

		//check to see if boot_out.txt is there, warn if not
		//need to add file scheme in windows
		let baseUri=curDriveSetting;
		if (os.platform()==='win32') {
			baseUri='file:'+baseUri;
		}
		//**replace glob find files with dir read for performance
		// ** issue #4, if drive no longer exists (like board unplugged) get error, handle
		let foundBootFile:any=undefined;
		try {
			const dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
			foundBootFile=dirContents.find((value:[string,vscode.FileType],index,ary) => {
				if(value.length>0){
					return value[0]===strgs_cpBootFile;
				} else {
					return false;
				}
			});
		} catch {foundBootFile=undefined;}
		//
		//let rel=new vscode.RelativePattern(vscode.Uri.parse(baseUri),'boot_out.txt');
		//const srchPath=vscode.Uri.joinPath(vscode.Uri.parse(curDriveSetting),'boot_out.txt');
		//const fles=await vscode.workspace.findFiles(rel);
		//if(fles.length===0) {
		if(!foundBootFile){
			if(pyFilesExist){
				statusBarItem1.text=`${strgs.btnCopyLbl} $(warning)`;
				//and the right tooltip
				statusBarItem1.tooltip=new vscode.MarkdownString(strgs_cpBootNoFindMKDN);
			}
			if(libFilesExist){
				statusBarItem2.text=`${strgs.btnLibLbl} $(warning)`;
				//and the right tooltip
				statusBarItem2.tooltip=new vscode.MarkdownString(strgs_cpBootNoFindMKDN);
			}
		} else {
			//Try to see if location of boot file matches one of the drives but not usb
			//	then can use the $(info) icon with a warning
			//SO logic is if no lastDrives or curDriveSetting is NOT in array or if it is in array
			//  but is not USB add the info icon with tooltip. Else normal copy enabled.
			let gotValidDrive:boolean=true;
			if(lastDrives){
				let validDrive=lastDrives.find((value:drvlstDrive,index,ary) => {
					return (curDriveSetting===value.drvPath && value.isUsb);
				});
				gotValidDrive=validDrive ? true : false;
			} 
			if(gotValidDrive) {
				if(pyFilesExist){
					statusBarItem1.text=strgs.btnCopyLbl;
					statusBarItem1.tooltip=strgs.enabledToCopy+curDriveSetting;
				}
				if(libFilesExist){
					statusBarItem2.text=strgs.btnLibLbl;
					statusBarItem2.tooltip=strgs.enabledToCopy+curDriveSetting;
				}
			} else {
				if(pyFilesExist){
					statusBarItem1.text=`${strgs.btnCopyLbl} $(info)`;
					statusBarItem1.tooltip=strgs.canCopyInsCurDrive[0]+curDriveSetting + strgs.canCopyInsCurDrive[1];
				}
				if(libFilesExist){
					statusBarItem2.text=`${strgs.btnLibLbl} $(info)`;
					statusBarItem2.tooltip=strgs.canCopyInsCurDrive[0]+curDriveSetting + strgs.canCopyInsCurDrive[1];
				}
			}
		}
	}
	//?? do we do show here??
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// this event should re-occur when a new workspace is opened, but need to 
	//	make sure nothing "bad" can happen if there is no workspace
	// set flag whether workspace is open, can use to disable actions
	haveCurrentWorkspace=vscode.workspace.workspaceFolders ? true : false;
	if (haveCurrentWorkspace) {
		console.log('Extension "circuitpythonsync" is now active in a workspace');
	} else {
		console.log('Extension is active BUT NOT IN WORKSPACE, SHOULD RE-ACTIVATE ON WS OPEN');
	}

	// ** try to get config settings that override defaults
	const cpsyncSettings=vscode.workspace.getConfiguration('circuitpythonsync');
	const strgs_cpfilesTry=cpsyncSettings.get('cpfilestxt');
	if(strgs_cpfilesTry){
		//got setting, put use as active
		strgs_cpfiles=strgs_cpfilesTry as string;
	}
	// set current into global
	cpsyncSettings.update('cpfilestxt',strgs_cpfiles,true);
	
	const strgs_cpfilesbakTry=cpsyncSettings.get('cpfilesbak');
	if(strgs_cpfilesbakTry){
		//got setting, put use as active
		strgs_cpfilesbak=strgs_cpfilesbakTry as string;
	}
	//set current into global
	cpsyncSettings.update('cpfilesbak',strgs_cpfilesbak,true);
	
	const strgs_cpBootFileTry=cpsyncSettings.get('cpbootfile');
	if(strgs_cpBootFileTry){
		//got setting, put use as active
		strgs_cpBootFile=strgs_cpBootFileTry as string;
	}
	//did not find so set current into global
	cpsyncSettings.update('cpbootfile',strgs_cpBootFile,true);
	
	vscode.window.showInformationMessage(`active cpfiles setting is: ${strgs_cpfiles}`);
	//vscode.window.showInformationMessage(`active cpfilesbak setting is: ${strgs_cpfilesbak}`);
	//vscode.window.showInformationMessage(`active cpbootfile setting is: ${strgs_cpBootFile}`);
	// ** and get revised messages **
	[strgs_noWriteCpfile,strgs_mngLibChooseLibs,strgs_noCodeFilesInCp,strgs_noPyCodeFilesInCp,strgs_fileInCpNoExist,strgs_noPyAndNonExistFilesInCp,strgs_warnNoLibsInCP]=strgs.getCpFilesMsgs(strgs_cpfiles);
	//vscode.window.showInformationMessage('one of revised cpfiles messages: '+strgs_noCodeFilesInCp);
	[strgs_cpBootNoFindMKDN]=strgs.getCpBootMsgs(strgs_cpBootFile);
	//vscode.window.showInformationMessage('revised cp boot file msg: '+strgs_cpBootNoFindMKDN);

	const helloWorldId:string=strgs.cmdHelloPKG;
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand(helloWorldId, () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		if(haveCurrentWorkspace) {
			vscode.window.showInformationMessage('Hello from CircuitPythonSync- workspace active!');
		} else {
			vscode.window.showInformationMessage('Hello from CircuitPythonSync- WORKSPACE NOT FOUND - ACTIONS INACTIVE!');
		}
	});
	context.subscriptions.push(disposable);

	const button1Id:string =strgs.cmdBtn1PKG;
	const button2Id:string =strgs.cmdBtn2PKG;

	function checkForCodeOrMainPy(codeFile:cpFileLine):boolean{
		return (codeFile.src.toLowerCase()==='code.py' || codeFile.src.toLowerCase()==='main.py'
			 || codeFile.dest.toLowerCase()==='code.py' || codeFile.dest.toLowerCase()==='main.py');
	}

	// ** the copy files button
	const sbItemCmd1=vscode.commands.registerCommand(button1Id, async () => {
		//if no workspace do nothing but notify
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		//if don't have drive can't copy
		if(curDriveSetting==='') {
			vscode.window.showInformationMessage(strgs.mustSetDrv);
			return;
		}
		//see if no valid files to copy
		if(!pyFilesExist) {
			vscode.window.showInformationMessage(strgs.noFilesSpecd);
			return;
		}
		//copy rules:
		//- defaults to non-lib files in cpfiles first
		//- if not look for code.py first, then main.py
		// ** always overwrite but no deletes
		const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
		if(!wsRootFolder){return;}	// will never return since we know we are in workspace
		const cpFileLines=await parseCpfiles();
		let cpCodeLines=cpFileLines.filter(lne => !lne.inLib);
		//setup some result tracking
		let copiedFilesCnt:number=0;
		let skippedFilesCnt:number=0;
		let errorFileCnt:number=0;
		let copiedCodeOrMainPy:boolean=false;
		//now get the source directory list for searching and file existance
		const rootDir=await vscode.workspace.fs.readDirectory(wsRootFolder.uri);
		//check to see if any code files specified
		if(cpCodeLines.length===0){
			//no cpfile specs, need to look for code.py then main.py, will have one or the other!
			//const srchCodeFiles=new vscode.RelativePattern(wsRootFolder,'{code,main}.py');
			//const fndCodes=await vscode.workspace.findFiles(srchCodeFiles);
			//if(!fndCodes || fndCodes.length===0) { return; } //???? should never????
			if(rootDir.some(val => val[0].toLowerCase()==='code.py')){
				cpCodeLines.push(
					{
						src:'code.py',
						dest:'',
						inLib:false
					}
				);
			} else if(rootDir.some(val => val[0].toLowerCase()==='main.py'))
			{
				cpCodeLines.push(
					{
						src:'main.py',
						dest:'',
						inLib:false
					}
				);
			} // ** let an empty array go through, will just do nothing
		}
		//now do the copy, possibly with rename
		let baseUri=curDriveSetting;
		if (os.platform()==='win32') {
			baseUri='file:'+baseUri;
		}
		// ** read the device to see if it is there **
		try{
			const dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
		} catch(error) {
			// ***** give error and bail *****
			const fse:vscode.FileSystemError=error as vscode.FileSystemError;
			vscode.window.showErrorMessage(strgs.abortFileCopyError+fse.message);
			return;
		}
		//
		let srcUri:vscode.Uri;
		let destUri:vscode.Uri;
		const wsRootFolderUri=wsRootFolder.uri;
		/* sort the lines such that code.py or main.py at the end */
		cpCodeLines.sort((a,b) => {
			//console.log(a,b);
			if((a.src==='code.py' || a.src==='main.py') && (b.src!=='code.py' && b.src!=='main.py')){return 1;}
			if((a.src!=='code.py' && a.src!=='main.py') && (b.src==='code.py' || b.src==='main.py')) {return -1;}
			return 0;
		});  
		for(const codeFile of cpCodeLines){
			// do some file checking and tracking
			if(checkForCodeOrMainPy(codeFile)){
				copiedCodeOrMainPy=true;
			}
			if(rootDir.some(val => val[0]===codeFile.src && val[1]===vscode.FileType.File)) {
				try {
					srcUri=vscode.Uri.joinPath(wsRootFolderUri,codeFile.src);
					destUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),
						(codeFile.dest==='' ? codeFile.src : codeFile.dest)
					);
					await vscode.workspace.fs.copy(srcUri,destUri,{overwrite:true});
					copiedFilesCnt+=1;
				} catch (error) {
					const fse:vscode.FileSystemError=error as vscode.FileSystemError;
					//******* give the error but continue */
					vscode.window.showErrorMessage(strgs.errorCopyingFile+fse.message);
					//see if it was code py file, if so reset the did copy...
					if(checkForCodeOrMainPy(codeFile)){ copiedCodeOrMainPy=false;}
					errorFileCnt+=1;
				}
			} else {
				skippedFilesCnt+=1;
			}
		}
		vscode.window.showInformationMessage(`Copy done: ${copiedCodeOrMainPy ? 'DID' : 'DID NOT'} copy python file.  ${copiedFilesCnt.toString()} files copied. ${skippedFilesCnt.toString()} files skipped. ${errorFileCnt.toString()} files errored.`);
		statusBarItem1.backgroundColor=undefined;
		
	});
	
	context.subscriptions.push(sbItemCmd1);

	// ** the copy lib button
	//when activated, set confirm of full lib copy to be on
	confirmFullLibCopy=true;
	const sbItemCmd2=vscode.commands.registerCommand(button2Id, async () => {
		//if no workspace do nothing but notify
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		//if don't have drive can't copy
		if(curDriveSetting==='') {
			vscode.window.showInformationMessage(strgs.mustSetDrv);
			return;
		} 
		//see if no valid lib to copy do msg and get out
		if(!libFilesExist) {
			vscode.window.showInformationMessage(strgs.noLibSpecd);
			return;
		}
		//#16, add confirmation if entire library is to be copied
		//read the cpfiles to see if no specs so whole library is the source...
		//but only if confirmation turned off
		const cpFileLines=await parseCpfiles();	//will need this later too
		let copyFullLibFolder=false;	//for later too
		if(cpFileLines.length===0 || !cpFileLines.some(lne => lne.inLib)){
				//yes, whole lib to be copied, confirm
				copyFullLibFolder=true;
		}
		if(copyFullLibFolder && confirmFullLibCopy){
				const confAns=await vscode.window.showWarningMessage(strgs.warnEntireLib,"Yes","No, cancel","Yes, don't ask again");
				if(!confAns || confAns==="No, cancel"){
					return;
				}
				if(confAns==="Yes, don't ask again") {
					confirmFullLibCopy=false;
				}
		}
		//now ready to copy... rules:
		// if flag set above copy whole lib folder
		// if not iterate through and copy, but need to use existing lib/Lib folder in cp drive if there
		// ** always overwrite but no deletes
		const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
		if(!wsRootFolder){return;}	// will never return since we know we are in workspace
		let cpLibLines=cpFileLines.filter(lne => lne.inLib);
		//setup some result tracking
		let copiedFilesCnt:number=0;
		let skippedFilesCnt:number=0;
		let errorFileCnt:number=0;
		//prep for accessing the device
		let baseUri=curDriveSetting;
		if (os.platform()==='win32') {
			baseUri='file:'+baseUri;
		}
		// need to find the actual path to the lib/Lib folder on the device
		let deviceCpLibPath:string='';
		try{
			const dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
			const libPaths=dirContents.find(val => val[0]==='lib' || val[0]==='Lib');
			if(libPaths && libPaths.length>0){
				deviceCpLibPath=libPaths[0];
			}
		} catch(error) {
			// ***** give error and bail *****
			const fse:vscode.FileSystemError=error as vscode.FileSystemError;
			vscode.window.showErrorMessage(strgs.abortLibCopyError+fse.message);
			return;
		}
		//get the source dir list for searching and file existance, and get source lib folder path
		const rootDir=await vscode.workspace.fs.readDirectory(wsRootFolder.uri);
		const libPaths=rootDir.find(val => val[0]==='lib' || val[0]==='Lib');
		let srcLibPath:string='';
		if(libPaths && libPaths.length>0){
			srcLibPath=libPaths[0];
			if(deviceCpLibPath===''){ deviceCpLibPath=srcLibPath;}
		}
		if(copyFullLibFolder){
			if(srcLibPath!==''){
				// ** this should always be true since we know we had library**
				// ** now do the copy **
				try {
					await vscode.workspace.fs.copy(
						vscode.Uri.joinPath(wsRootFolder.uri,srcLibPath),
						vscode.Uri.joinPath(vscode.Uri.parse(baseUri),deviceCpLibPath),
						{overwrite:true}
					);
				} catch(error) {
					// ** notify error and bail
					const fse:vscode.FileSystemError=error as vscode.FileSystemError;
					vscode.window.showErrorMessage(strgs.abortWholeLibCopyError+fse.message);
					return;
				}
				// ** give copied notice here of just whole library
				vscode.window.showInformationMessage(strgs.wholeLibCopyDone);
			} else {
				return;  //should never!!
			}
		} else {
			//iterate through the cplines
			let srcUri:vscode.Uri;
			let destUri:vscode.Uri;
			const srcLibUri=vscode.Uri.joinPath(wsRootFolder.uri,srcLibPath);
			const destLibUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),deviceCpLibPath);
			const libDir=await vscode.workspace.fs.readDirectory(srcLibUri);
			for(const cpLine of cpLibLines){
				//make sure src file/folder is in dir
				if(libDir.some(val => val[0]===cpLine.src)) {
					// ** copy **
					try {
						srcUri=vscode.Uri.joinPath(srcLibUri,cpLine.src);
						destUri=vscode.Uri.joinPath(destLibUri,
							(cpLine.dest==='' ? cpLine.src : cpLine.dest)
						);
						await vscode.workspace.fs.copy(srcUri,destUri,{overwrite:true});
						copiedFilesCnt+=1;
					} catch (error) {
						const fse:vscode.FileSystemError=error as vscode.FileSystemError;
						// ** give the error ** but continue
						vscode.window.showErrorMessage(strgs.errorCopyingLibFile+fse.message);
						errorFileCnt+=1;
					}
				} else {
					skippedFilesCnt+=1;
				}
			}
			vscode.window.showInformationMessage(`Lib Copy done with ${copiedFilesCnt.toString()} files copied, ${skippedFilesCnt.toString()} files skipped, ${errorFileCnt.toString()} files errored.`);
		}
		statusBarItem2.backgroundColor=undefined;
		
	});
	
	context.subscriptions.push(sbItemCmd2);

	//custom object for pick to save src only
	interface libSelPick extends vscode.QuickPickItem {
		src:string,
		dest:string
	}

	const mngCpFilesId:string=strgs.cmdMngLibPKG;
	//#15, command to manage cpfiles library settings
	const cmdMngLibSettings=vscode.commands.registerCommand(mngCpFilesId, async () => {
		//if no workspace do nothing but notify
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		if(!libFilesExist) {
			vscode.window.showInformationMessage(strgs.noLibDir);
			return;
		}
		//first read the current cpfile
		const cpLines=await parseCpfiles();
		//then get the current merged list
		let libListSelects=await getlibListSelect(cpLines);
		//now create a list of quickpicks
		// construct themeicons to use in pick instead of literals
		const fileIcon:vscode.ThemeIcon=new vscode.ThemeIcon("file");
		const folderIcon:vscode.ThemeIcon=new vscode.ThemeIcon("folder");
		let picks:libSelPick[]=Array<libSelPick>(0);
		for(const libSel of libListSelects) {
			const pick:libSelPick={
				label: libSel.fullPath + (libSel.dest ? " -> "+libSel.dest : ""),
				picked:libSel.selected,
				iconPath:(libSel.fType===vscode.FileType.File ? fileIcon : folderIcon),
				src:libSel.src,
				dest:libSel.dest
			};
			picks.push(pick);
		}
		const pickOpt:vscode.QuickPickOptions={
			canPickMany:true,
			placeHolder: strgs.mngLibChecks,
			title: strgs_mngLibChooseLibs
		};
		const newChoices=await vscode.window.showQuickPick<libSelPick>(picks,
			{title:strgs_mngLibChooseLibs, placeHolder:strgs.mngLibChecks, canPickMany:true}
		);
		if(newChoices){
			//the return is only the new picks, all others in cpfiles should be deleted
			//just format the file again from cpLines and newChoices
			// **BUT, if cplines had dest and it is NOT in choices, give warning and choice to stop **
			if(
				cpLines.some((cpl) => {
					return (cpl.inLib && cpl.dest && !newChoices.some(nc => nc.src===cpl.src));
				})
			){
				let ans=await vscode.window.showWarningMessage(strgs.destMapsDel,"Yes","No");
				if(ans==="No"){return;}
			}
			// **ALSO, if all lib paths are taken out warn that entire library will be copied
			if(newChoices.length===0){
				let ans=await vscode.window.showWarningMessage(strgs.cnfrmEntireLib,"Yes","No");
				if(ans==="No"){return;}
			}
			//get the files only lines from cpLines
			const cpLinesPy=cpLines.filter(lne => !lne.inLib);
			//now start constructing the new file
			let newFileContents:string="";
			for(const lne of cpLinesPy){
				newFileContents+=lne.src+(lne.dest ? " -> "+lne.dest : "")+"\n";
			}
			//now add the selections from choices 
			for(const nc of newChoices){
				newFileContents+=nc.label+"\n";
			}
			//write cpfiles, creating if needed and making backup if orig not empty
			const wrslt=await writeCpfiles(newFileContents);
			if(wrslt){
				//give error message
				vscode.window.showErrorMessage(wrslt);
				return;
			}
			// ** Per #22, if file written was not blank BUT no py files were included then
			//	give a warning that only code.py or main.py will be copied, and option to edit
			/* NOT NEEDED HERE, FILE WATCHER ON CPFILES WILL PICK UP CHANGES
			if(newFileContents && cpLinesPy.length===0){
				const ans=await vscode.window.showWarningMessage(strgs_noCodeFilesInCp,"Yes","No");
				if(ans==="Yes"){
					const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
					if(!wsRootFolder) {return "";}
					const cpFilePath:vscode.Uri=vscode.Uri.joinPath(wsRootFolder.uri,`.vscode/${strgs_cpfiles}`);
					const doc=await vscode.workspace.openTextDocument(cpFilePath);
					vscode.window.showTextDocument(doc);
				}
			} else {
				// ** Per #26, also give warning/edit opp if no python files in files only set
				const cpLinesPyPy=cpLinesPy.filter(lne => lne.src.endsWith('.py'));
				if(newFileContents && cpLinesPy.length>0 && cpLinesPyPy.length===0){
					const ans=await vscode.window.showWarningMessage(strgs_noPyCodeFilesInCp,"Yes","No");
					if(ans==="Yes"){
						const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
						if(!wsRootFolder) {return "";}
						const cpFilePath:vscode.Uri=vscode.Uri.joinPath(wsRootFolder.uri,`.vscode/${strgs_cpfiles}`);
						const doc=await vscode.workspace.openTextDocument(cpFilePath);
						vscode.window.showTextDocument(doc);
					}	
				}
			}
			*/
		}
	});
	context.subscriptions.push(cmdMngLibSettings);
	
	// ** query attached drives for the initial cache
	await refreshDrives();

	//get the initial drive setting, save for button setup
	//NOTE that if no workspace this will be empty string, so OK
	curDriveSetting=getCurrentDriveConfig();
	//????? save in ext state?
	//context.subscriptions.push(curDriveSetting);

	//set the flags for whether have files and/or lib to copy
	//just read the top level of the base workspace folder, if workspace open
	libraryFolderExists=false;
	libFilesExist=false;
	pyFilesExist=false;
	if(vscode.workspace.workspaceFolders) {	//this just needed to satisfy type check
		const wsContents=await vscode.workspace.fs.readDirectory(vscode.workspace.workspaceFolders[0].uri);
		//first see if lib there
		const foundLib=wsContents.find((value:[string,vscode.FileType],index,ary) => {
			if(value.length>0){
				const gotLib=value[0].match(/^[lL]ib$/) ? true : false;
				return gotLib && value[1]===vscode.FileType.Directory;
			} else {
				return false;
			}
		});
		if(foundLib) {
			libraryFolderExists=true;
		}
		//now the files
		//parse the cpfiles first, decide if need to plug in defaults or not to check dirs
		let cpFileLines=await parseCpfiles();
		// ** #22, also use default py files if not included in cpFileLines
		if(!cpFileLines || cpFileLines.length===0 || !cpFileLines.some(lne => !lne.inLib)){
			//just put in default py files to check and no lib
			cpFileLines=[
				{
					src:'code.py', dest:'',	inLib:false
				},
				{
					src: 'main.py',	dest: '', inLib: false
				}
			];
		}
		//now check sources
		const fileSources=await checkSources(cpFileLines);
		if(fileSources) {
			pyFilesExist=fileSources.pyExists;
			libFilesExist=fileSources.libExists;
		}
		/* should not need now
		const foundPys=wsContents.find((value:[string,vscode.FileType],index,ary) => {
			if(value.length>0){
				return (value[0].includes("main.py") || value[0].includes("code.py")) && value[1]===vscode.FileType.File;
			} else {
				return false;
			}
		});
		if(foundPys) {
			pyFilesExist=true;
		}
		*/
	}

	//create the status bar button
	//NOTE even with no workspace create but don't show
	statusBarItem1= vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
	statusBarItem1.command=button1Id;
	statusBarItem2=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
	statusBarItem2.command=button2Id;
	updateStatusBarItems();
	//statusBarItem1.text='CPCopy';
	//if(curDriveSetting===''){statusBarItem1.color='#444444';}
	context.subscriptions.push(statusBarItem1);
	context.subscriptions.push(statusBarItem2);
	//show the status bar item
	//* if no workspace hide the button, will generally show because activate runs when workspace setup
	//	BUT can also show on workspace event???
	if(haveCurrentWorkspace) {
		statusBarItem1.show();
		statusBarItem2.show();
	} else {
		statusBarItem1.hide();
		statusBarItem2.hide();
	}

	// ** Issue #10 - see if a usb drive with boot file exists, if so, offer to connect but only if not current **
	//	have the current mapping and the last drive list
	// find the first usb drive in last drives, if any
	//BUT can't do anything if no workspace
	if(haveCurrentWorkspace) {
		const connectCandidate=lastDrives.find((drv:drvlstDrive,index,ary) => {
			return drv.isUsb;
		});
		//if got a candidate, check it...
		let connectDrvPath:string='';
		if(connectCandidate) {
			if(connectCandidate.drvPath.toLowerCase().includes('circuitpy')) {
				connectDrvPath=connectCandidate.drvPath;
			} else {
				// need to search for the boot file
				let baseUri=connectCandidate.drvPath;
				if (os.platform()==='win32') {
					baseUri='file:'+baseUri;
				}
				const dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
				let foundBootFile=dirContents.find((value:[string,vscode.FileType],index,ary) => {
					if(value.length>0){
						return value[0]===strgs_cpBootFile;
					} else {
						return false;
					}
				});
				if(foundBootFile){
					connectDrvPath=connectCandidate.drvPath;
				}
			}
			//if got a connect path, offer it in info message
			if(connectDrvPath){
				//make sure is not same as current mapping
				if(connectDrvPath!==curDriveSetting) {
					const pickRes=await vscode.window.showInformationMessage(strgs.fndCPDrvInsPath[0]+connectDrvPath+strgs.fndCPDrvInsPath[1],'Yes','No');
					if(pickRes==='Yes') {
						vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confDrivepathPKG}`,connectDrvPath);
						curDriveSetting=connectDrvPath;
						updateStatusBarItems();
					}
				}
			}
		}
	}

	// listen to the workspace change event to see if button should be shown 
	//	** this is probably not needed since "normal" workspace changes will re-trigger activate
	const wkspcChg=vscode.workspace.onDidChangeWorkspaceFolders( (event) => {
		haveCurrentWorkspace=vscode.workspace.workspaceFolders ? true : false;
		if(haveCurrentWorkspace) {
			statusBarItem1.show();
			statusBarItem2.show();
		}
	});

	context.subscriptions.push(wkspcChg);

	const openDirId:string=strgs.cmdSetDirPKG;
	//command to get drive using open file dialog -- NOW it tries to find CP drive first
	const fileCmd=vscode.commands.registerCommand(openDirId, async () => {
		// ** if no workspace this command does nothing but give warning **
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		} 
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
				label: strgs.pickManual,
				description: ''
			}
		];
		//try to find the CP drive:
		//- it has to have a mountpoint with a non-empty path, only first is used
		//- must be a usb type drive 
		//- if CIRCUITPY shows up in path it is setup as CP drive
		//- if boot_out.txt is found in the root of the path it is a CP drive
		let detectedPaths:string[]=[];	//this is for checking curDrive later and classifying
		let detectedPathsNotUsb:string[]=[];
		try {
			const drives:drivelist.Drive[] = await drivelist.list();
			for(const drv of drives) {
			//drives.forEach(drv => {
			  if(drv.mountpoints.length>0) {
				console.log(drv.mountpoints[0].path, 'isUsb? ',drv.isUSB);
				let drvPath:string=drv.mountpoints[0].path;
				//if windows remove backslashes
				if(os.platform()==='win32') {
					drvPath=drvPath.replace(/\\/g,'');
				}
				let detectedPath:string='';
				let detectedPathNotUsb:string='';
				//Issue #7, defer usb decision so can list possible but not usb detections
				if(drvPath) {	// && drv.isUSB) {
					//see if path contains circuitpy
					if(drvPath.toLowerCase().includes('circuitpy')) {
						detectedPath= drv.isUSB ? drvPath : '';
						detectedPathNotUsb= !drv.isUSB ? drvPath : '';
					} else {
						//not detected yet, see if boot_out.txt at path
						//need to add file scheme in windows
						let baseUri=drvPath;
						if (os.platform()==='win32') {
							baseUri='file:'+baseUri;
						}
						//**replace glob find files with dir read for performance
						const dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
						let foundBootFile=dirContents.find((value:[string,vscode.FileType],index,ary) => {
							if(value.length>0){
								return value[0]===strgs_cpBootFile;
							} else {
								return false;
							}
						});
						//let rel=new vscode.RelativePattern(vscode.Uri.parse(baseUri),'boot_out.txt');
						//const fles=await vscode.workspace.findFiles(rel);
						//vscode.workspace.findFiles(rel).then(fles => {
						//if(fles.length>0) {
						if(foundBootFile){
							//got the file
							//check if it is usb or not
							detectedPath= drv.isUSB ? drvPath : '';
							detectedPathNotUsb= !drv.isUSB ? drvPath : '';
						}
						//});
					}
					//if detected the path push it in picks array and add to list (this is usb)
					if(detectedPath) {
						detectedPaths.push(detectedPath);
						const mappedDrive:drivePick={
							path:detectedPath,
							label:detectedPath,
							description:'',
							detail: `           $(debug-disconnect) ${strgs.autoDetect}`
						};
						picks.unshift(mappedDrive);				
					}
					//else see if detected but not usb
					if(detectedPathNotUsb) {
						detectedPathsNotUsb.push(detectedPathNotUsb);
						const mappedDrive:drivePick={
							path:detectedPathNotUsb,
							label:detectedPathNotUsb,
							description:'',
							detail: `           $(info) ${strgs.autoDetectNotUSB}`
						};
						picks.unshift(mappedDrive);				
					}
				}
			  }
			};
		} catch (error) {
			console.error(strgs.errListingDrv, error);
		}		
		//FAKE this is the "detected" drive
		// const mappedDrive:drivePick={
		// 	path:'/media/stan',
		// 	label:'/media/stan',
		// 	description:'',
		// 	detail: '           $(debug-disconnect) Auto Detected'
		// };
		// picks.unshift(mappedDrive);
		//see if the curDrive is not included in the detected ones, if not add it, ONLY if not blank
		// also include not usb paths if any
		if(curDrive!=='' && !(detectedPaths.includes(curDrive) || detectedPathsNotUsb.includes(curDrive))) {
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
			placeHolder:strgs.pickDrvOrManual,
			title: strgs.cpDrvSel
		});
		//if(result) {vscode.window.showInformationMessage(result.label);};
		//if no choice just get out
		if(!result){return;}
		// ** at this point may have changes so go ahead and refresh the drive list
		await refreshDrives();
		// **
		//if got path selection (that is, not manual select) but no change, just get out
		//NO, issue #2, update button anyway in case contents changed
		if(result.path!=='' && result.path===curDrive) {
			updateStatusBarItems();	
			return;
		}
		//otherwise if selected detected drive, just update config, else open file dialog
		if(result.path!=='') {
			vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confDrivepathPKG}`,result.path);
			//set the status bar text to active and save setting locally
			curDriveSetting=result.path;
			//statusBarItem1.color=undefined;
			updateStatusBarItems();
		} else {
			let baseUri=curDrive;
			if (os.platform()==='win32') {
				baseUri='file:'+baseUri+'//';
			}
			const opts: vscode.OpenDialogOptions={
				canSelectFiles:false,
				canSelectFolders:true,
				canSelectMany:false,
				defaultUri: curDrive==='' ? vscode.Uri.parse('/') : vscode.Uri.parse(baseUri),
				title: strgs.pickDrvOrMount
				};
			const dirs=await vscode.window.showOpenDialog(opts);
			if(dirs){
				//vscode.window.showInformationMessage('selected: '+dirs[0].fsPath);
				//save the config
				curDriveSetting=dirs[0].fsPath;
				//if windows upper case and remove backslashes
				//UNLESS it has path after drive letter, then change \\ to //
				if(os.platform()==='win32') {
					curDriveSetting=curDriveSetting.replace(/\\/g,'/');
					if(curDriveSetting.endsWith('/')) {
						curDriveSetting=curDriveSetting.toUpperCase().replace(/\//g,'');
					}
				}
				vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confDrivepathPKG}`,curDriveSetting);
				//set the status bar text to active and save setting locally
				//statusBarItem1.color=undefined;
				updateStatusBarItems();
			} else {
				// ??? leave the status bar color as is??
			}
		}
		statusBarItem1.show();
		statusBarItem2.show();
	});
	context.subscriptions.push(fileCmd);

	// ** set defaults for remembered download settings
	confirmDnldOverwrite=true;
	confirmDnldSkipDots=true;
	
	const dnldCpBoardId:string = strgs.cmdDownloadCPboardPKG;
	// ** Command to download circuitpython board, uses current mapping
	const dndBoardCmd=vscode.commands.registerCommand(dnldCpBoardId, async () =>{
		//if no workspace do nothing but notify
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		//if don't have drive can't copy
		if(curDriveSetting==='') {
			vscode.window.showInformationMessage(strgs.mustSetDrv);
			return;
		}
		//now try to read the mapped drive directory
		//need to add file scheme in windows
		let baseUri=curDriveSetting;
		if (os.platform()==='win32') {
			baseUri='file:'+baseUri;
		}
		//**replace glob find files with dir read for performance
		// ** issue #4, if drive no longer exists (like board unplugged) get error, handle
		let gotCpDirectory:boolean=false;
		let dirContents:[string,vscode.FileType][]=Array<[string,vscode.FileType]>(0);
		try {
			dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
			gotCpDirectory=true;
		} catch {gotCpDirectory=false;}
		if(!gotCpDirectory){
			const errMsg=strgs.couldNotReadCpDnld[0]+curDriveSetting+strgs.couldNotReadCpDnld[1];
			await vscode.window.showErrorMessage(errMsg);
			return;
		}
		// ** now give a quick pick to see if want to change current config
		let skipDotFiles=confirmDnldSkipDots;
		let allowOverwrite=confirmDnldOverwrite;
		const dnldConfigPicks:vscode.QuickPickItem[]=[
			{
				label: strgs.pickAllowOverwrite,
				picked: allowOverwrite				
			},
			{
				label: strgs.pickSkipDots,
				picked: skipDotFiles
			}
		];
		const choices=await vscode.window.showQuickPick(dnldConfigPicks,
			{title: strgs.dnldCfgQpTitle,placeHolder: strgs.dnldCfgQpPlchld, canPickMany:true}
		);
		// ** if no choice that is cancel, get out
		if(!choices){return;}
		// process choices, updating tracking too, NOTE that uncheck is not returned, so is false
		// AND picked prop is not set, so just pick showing in result means selected
		// SO set both settings to false, let loop set true
		allowOverwrite=false;
		skipDotFiles=false;
		for(const choice of choices){
			if(choice.label===strgs.pickAllowOverwrite) { 
				allowOverwrite=true;
			}
			if(choice.label===strgs.pickSkipDots){
				skipDotFiles=true;
			}
		}
		confirmDnldOverwrite=allowOverwrite;
		confirmDnldSkipDots=skipDotFiles;
		//now ready to download to workspace (have to check to resolve transpiler)
		const wsRootFolderUri=vscode.workspace.workspaceFolders?.[0].uri;
		if(!wsRootFolderUri) {return;}
		for(const dirEntry of dirContents){
			if(!skipDotFiles || !dirEntry[0].startsWith('.')){
				const srcUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),dirEntry[0]);
				const destUri=vscode.Uri.joinPath(wsRootFolderUri,dirEntry[0]);
				try {
					await vscode.workspace.fs.copy(srcUri,destUri,{overwrite:allowOverwrite});
				} catch(error) {
					const fse=error as vscode.FileSystemError;
					if(fse.code==='FileExists'){
						// ** tell user can't copy over but will skip and continue
						vscode.window.showWarningMessage(strgs.dnldWarnOverwrite+dirEntry[0]);
					} else {
						// ** tell user other error occurred, aborting
						vscode.window.showErrorMessage(strgs.dnldCopyError+fse.message);
						return;
					}
				}
			}
		}


	});
	context.subscriptions.push(dndBoardCmd);

	// look for config change
	const cfgChg=vscode.workspace.onDidChangeConfiguration(async (event) => {
		//NOTE can't affect this ext config if no workspace, not global
		// BUT just return to keep noise level down
		if(!haveCurrentWorkspace){return;}
		// ** refresh drive list in case changed
		await refreshDrives();
		// **
		//see if the drivepath changed
		if (event.affectsConfiguration(`circuitpythonsync.${strgs.confDrivepathPKG}`)) {
			const curDrive=getCurrentDriveConfig();
			if (curDriveSetting!==curDrive) {
				curDriveSetting=curDrive;
				updateStatusBarItems();
				// if(curDrive===''){
				// 	statusBarItem1.color='#444444';
				// } else {
				// 	statusBarItem1.color=undefined;
				// }
				statusBarItem1.show();
				statusBarItem2.show();
			}
		}
	});
	context.subscriptions.push(cfgChg);

	//show info if text doc changed
	const txtChg=vscode.workspace.onDidSaveTextDocument(async (event) => {
		//NOTE ASSUME THAT file change doesn't affect this ext if no workspace????
		// BUT just return to keep noise level down
		//NOTE, this fires when any files in workspace are edited OR settings changes
		//NOTE,  just saving should not change the validity of the file or library copies
		//  UNLESS it is cpfiles, so do the refresh and then check current file against copy specs
		// ALSO tracking library changes should be done in filewatcher not here
		if(!haveCurrentWorkspace){return;}
		// ** Per #22, put in file watcher on cpfiles.txt, so don't process that here
		if(event.fileName.toLowerCase().endsWith(strgs_cpfiles)){return;}
		// ** refresh drive list in case changed
		await refreshDrives();
		// ** refresh the spec status
		let cpFileLines=await parseCpfiles();
		// ** #22, also use default py files if not included in cpFileLines
		if(!cpFileLines || cpFileLines.length===0 || !cpFileLines.some(lne => !lne.inLib)){
			//just put in default py files to check and no lib
			cpFileLines=[
				{
					src:'code.py', dest:'',	inLib:false
				},
				{
					src: 'main.py',	dest: '', inLib: false
				}
			];
		}
		//now check sources
		const fileSources=await checkSources(cpFileLines);
		if(fileSources) {
			pyFilesExist=fileSources.pyExists;
			libFilesExist=fileSources.libExists;
		}
		// if either type is not valid, need to turn off lighting
		if(!pyFilesExist){
			statusBarItem1.backgroundColor=undefined;
		}
		if(!libFilesExist){
			statusBarItem2.backgroundColor=undefined;
		}
		// see if file event was in the specs, libs don't show up here since not edited
		// note this won't be found if pyFilesExist is false
		const foundEl=cpFileLines.some(lne => !lne.inLib && event.fileName.toLowerCase().endsWith(lne.src.toLowerCase()));
		if(foundEl){
			statusBarItem1.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
		}
		//now check whether change was in cpfiles itself, if so and flags are on, light up
		// ** Will not get here...
		/*
		if(event.fileName.toLowerCase().endsWith("cpfiles.txt")){
			if(pyFilesExist){
				statusBarItem1.backgroundColor=new vscode.ThemeColor('statusBarItem.warningBackground');
			}
			if(libFilesExist){
				statusBarItem2.backgroundColor=new vscode.ThemeColor('statusBarItem.warningBackground');
			}
		}
		*/
		updateStatusBarItems();
		statusBarItem1.show();
		statusBarItem2.show();

		//vscode.window.showInformationMessage('file changed: '+event.fileName);
		//see if cpfiles.txt is in .vscode dir
		//const fles=await vscode.workspace.findFiles('**/.vscode/cpfiles.txt');
		/*
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
		*/
	});
	context.subscriptions.push(txtChg);

	//see if workspace folders changed to determine if library is there or was removed and copy files
	//const wsFlderChg=vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
	// ** NOTE this does not track folder changes in workspace, only workspace changes itself
	//file sytem watchers do watch files and folders

	//none of this can work if not a workspace, will reload when go into workspace
	if(haveCurrentWorkspace && vscode.workspace.workspaceFolders){
		//first the library watch
		const relLibPath=new vscode.RelativePattern(vscode.workspace.workspaceFolders[0],"[Ll]ib/**");
		const libWatcher=vscode.workspace.createFileSystemWatcher(relLibPath);
		const libWatchCreate=libWatcher.onDidCreate(async (uri) => {
			libraryFolderExists=true;
			//vscode.window.showInformationMessage("got create: "+uri.fsPath);
			//check to see if lib files exist that match specs
			let cpFileLines=await parseCpfiles();
			//don't need to pass defaults if cpfilesempty, just checking library
			const fileSources=await checkSources(cpFileLines);
			//turn off the light, only turn on if valid
			statusBarItem2.backgroundColor=undefined;
			if(fileSources.libExists) {
				libFilesExist=fileSources.libExists;
				//check to see if created file/folder is "valid" to light:
				//	- cpfiles has no lib listings, in which case whole folder is valid
				//	- cpfiles has the path created
				if(!cpFileLines.some(lne => lne.inLib) || cpFileLines.some(lne => uri.path.endsWith(lne.src))){
					statusBarItem2.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
				}
			} else {
				libFilesExist=false;
			}
			updateStatusBarItems();
		});
		const libWatchDelete=libWatcher.onDidDelete(async (uri) => {
			//since looking down in lib folder, see if folder itself deleted first
			//turn off the light, only turn on if valid
			statusBarItem2.backgroundColor=undefined;
			if(uri.fsPath.match(/[lL]ib$/)){
				libraryFolderExists=false;
				libFilesExist=false;
			} else {
				libraryFolderExists=true;
				//look at remaining status
				let cpFileLines=await parseCpfiles();
				//don't need to pass defaults if cpfilesempty, just checking library
				const fileSources=await checkSources(cpFileLines);
				if(fileSources.libExists) {
					libFilesExist=fileSources.libExists;
					//check to see if deleted file/folder is "valid" to light:
					//	- cpfiles has no lib listings, in which case whole folder is valid
					//	- cpfiles has the path deleted so it will be cleaned up on copy
					if(!cpFileLines.some(lne => lne.inLib) || cpFileLines.some(lne => uri.path.endsWith(lne.src))){
						statusBarItem2.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
					}
				} else {
					libFilesExist=false;
				}
			}
			//vscode.window.showInformationMessage("got delete: "+uri.fsPath);
			updateStatusBarItems();
		});
		context.subscriptions.push(libWatcher);
		context.subscriptions.push(libWatchCreate);
		context.subscriptions.push(libWatchDelete);
		//now the py files, will need to check cpfiles
		const relFilesPath=new vscode.RelativePattern(vscode.workspace.workspaceFolders[0],'*.*');
		const pyFileWatcher=vscode.workspace.createFileSystemWatcher(relFilesPath);
		const pyWatchCreate=pyFileWatcher.onDidCreate(async (uri) => {
			//vscode.window.showInformationMessage("got py create: "+uri.fsPath);
			let cpFileLines=await parseCpfiles();
			// ** #22, also use default py files if not included in cpFileLines
			if(!cpFileLines || cpFileLines.length===0 || !cpFileLines.some(lne => !lne.inLib)){
				//just put in default py files to check and no lib
				cpFileLines=[
					{
						src:'code.py', dest:'',	inLib:false
					},
					{
						src: 'main.py',	dest: '', inLib: false
					}
				];
			}
			//now check sources
			const fileSources=await checkSources(cpFileLines);
			if(fileSources.pyExists) {
				//in any case valid files are in cpfiles
				pyFilesExist=fileSources.pyExists;
				//make sure the file created is valid to copy to decide lighting
				if(cpFileLines && cpFileLines.length>0){
					//cpfiles exists, make sure new file in there to light it up
					if(cpFileLines.some(entry => !entry.inLib && uri.path.endsWith(entry.src))){
						// ** since a valid file was created, treat like a change and light it up
						statusBarItem1.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
					}
				} else {
					// ** cp files empty so it's a valid file, treat like a change and light it up
					statusBarItem1.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
				}
			} else {
				pyFilesExist=false;
			}
			//now update status button
			await updateStatusBarItems();
		});
		const pyWatchDelete=pyFileWatcher.onDidDelete(async (uri) => {
			//vscode.window.showInformationMessage("got py delete: "+uri.fsPath);
			let cpFileLines=await parseCpfiles();
			// ** #22, also use default py files if not included in cpFileLines
			if(!cpFileLines || cpFileLines.length===0 || !cpFileLines.some(lne => !lne.inLib)){
				//just put in default py files to check and no lib
				cpFileLines=[
					{
						src:'code.py', dest:'',	inLib:false
					},
					{
						src: 'main.py',	dest: '', inLib: false
					}
				];
			}
			//now check sources
			const fileSources=await checkSources(cpFileLines);
			if(fileSources.pyExists) {
				pyFilesExist=fileSources.pyExists;
			} else {
				pyFilesExist=false;
			}
			//now update status button
			await updateStatusBarItems();
		});
		context.subscriptions.push(pyFileWatcher);
		context.subscriptions.push(pyWatchCreate);
		context.subscriptions.push(pyWatchDelete);

		// **Monitor changes to cpfiles due to mng tool changes not triggering text doc save
		const relFileLstPath=new vscode.RelativePattern(vscode.workspace.workspaceFolders[0],`.vscode/${strgs_cpfiles}`);
		const fileListWatcher=vscode.workspace.createFileSystemWatcher(relFileLstPath);
		//this will pickup create and change
		const fileListWatchChg=fileListWatcher.onDidChange(async (uri) => {
			// ** refresh drive list in case changed
			await refreshDrives();
			// ** refresh the spec status
			let cpFileLines=await parseCpfiles();
			// need to save original copy of file for checking later
			let origCpLines=[...cpFileLines];
			// ** #22, also use default py files if not included in cpFileLines
			if(!cpFileLines || cpFileLines.length===0 || !cpFileLines.some(lne => !lne.inLib)){
				//just put in default py files to check and no lib
				const cpFileLinesAdd=[
					{
						src:'code.py', dest:'',	inLib:false
					},
					{
						src: 'main.py',	dest: '', inLib: false
					}
				];
				cpFileLines.push(...cpFileLinesAdd);
			}
			//now check sources
			const fileSources=await checkSources(cpFileLines);
			if(fileSources) {
				pyFilesExist=fileSources.pyExists;
				libFilesExist=fileSources.libExists;
			}
			// if either type is not valid, need to turn off lighting
			if(!pyFilesExist){
				statusBarItem1.backgroundColor=undefined;
			}
			if(!libFilesExist){
				statusBarItem2.backgroundColor=undefined;
			}
			// see if file event was in the specs, libs don't show up here since not edited
			// note this won't be found if pyFilesExist is false
			const foundEl=cpFileLines.some(lne => !lne.inLib && uri.fsPath.toLowerCase().endsWith(lne.src.toLowerCase()));
			if(foundEl){
				statusBarItem1.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
			}
			//now check whether change was in cpfiles itself, if so and flags are on, light up
			// ** currently will always be only cpfiles but check anyway
			if(uri.fsPath.toLowerCase().endsWith(strgs_cpfiles)){
				if(pyFilesExist){
					statusBarItem1.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
				}
				if(libFilesExist){
					statusBarItem2.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
				}
			}
			updateStatusBarItems();
			statusBarItem1.show();
			statusBarItem2.show();

			// ** ALSO warn about potential issues with code files in cpfiles, same as with mng libs cmd
			//get the files only lines from cpLines, BUT USE THE ORIG, NOT ONE WITH FAKE CP'S.
			const cpLinesPy=origCpLines.filter(lne => !lne.inLib);
			// ** Per #22, if file written was not blank BUT no py files were included then
			//	give a warning that only code.py or main.py will be copied, and option to edit
			// ** per #26, two new flags from CheckSources that tell more about files listed in cpfiles
			//first make sure another toast isn't up
			// **THIS DOES NOT SEEM TO WORK**
			/*
			const ctxkeys=await vscode.commands.executeCommand('getContextKeyInfo') as Array<{key:string,value:boolean}>;
			if(ctxkeys && ctxkeys.find((k) => {
					return k.key==='notificationToastsVisible' && k.value;
				})
			){
				//just bail
				return;
			}
			*/
			let triggerEdit=false;
			let toastShown=false;
			//first check for no lib files and give warning
			if(!origCpLines.some(lne => lne.inLib)){
				const ans=await vscode.window.showWarningMessage(strgs_warnNoLibsInCP,"Yes","No");
				toastShown=true;
				if(ans==="Yes"){
					triggerEdit=true;
				}
			}
			//then if didn't ask about library (that is, there were some), see if there are no code files
			if(!toastShown && cpLinesPy.length===0){
				const ans=await vscode.window.showWarningMessage(strgs_noCodeFilesInCp,"Yes","No");
				toastShown=true;
				if(ans==="Yes"){
					triggerEdit=true;
				}
			} else {
				// ** Per #26, also give warning/edit opp if no python files in files only set, and some no exist
				//  ALSO these conditions are from checkSources now
				//  ** try to show just one message, so offer a combined if so
				if(!toastShown && fileSources.noPyFiles && !fileSources.filesNoExist){
					const ans=await vscode.window.showWarningMessage(strgs_noPyCodeFilesInCp,"Yes","No");
					toastShown=true;
					if(ans==="Yes"){
						triggerEdit=true;
					}	
				}
				if(!toastShown && fileSources.filesNoExist && !fileSources.noPyFiles){
					const ans=await vscode.window.showWarningMessage(strgs_fileInCpNoExist,"Yes","No");
					toastShown=true;
					if(ans==="Yes"){
						triggerEdit=true;
					}
				}
				if(!toastShown && fileSources.filesNoExist && fileSources.noPyFiles){
					const ans=await vscode.window.showWarningMessage(strgs_noPyAndNonExistFilesInCp,"Yes","No");
					toastShown=true;
					if(ans==="Yes"){
						triggerEdit=true;
					}
				}
			}
			//check if want to edit
			if(triggerEdit){
				const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
				if(!wsRootFolder) {return "";}
				const cpFilePath:vscode.Uri=vscode.Uri.joinPath(wsRootFolder.uri,`.vscode/${strgs_cpfiles}`);
				const doc=await vscode.workspace.openTextDocument(cpFilePath);
				vscode.window.showTextDocument(doc);
			}

		});
		//need to do same for delete
		const fileListWatchDelete=fileListWatcher.onDidDelete(async (uri) => {
			// ** refresh drive list in case changed
			await refreshDrives();
			// ** refresh the spec status
			let cpFileLines=await parseCpfiles();
			// ** #22, also use default py files if not included in cpFileLines
			if(!cpFileLines || cpFileLines.length===0 || !cpFileLines.some(lne => !lne.inLib)){
				//just put in default py files to check and no lib
				cpFileLines=[
					{
						src:'code.py', dest:'',	inLib:false
					},
					{
						src: 'main.py',	dest: '', inLib: false
					}
				];
			}
			//now check sources
			const fileSources=await checkSources(cpFileLines);
			if(fileSources) {
				pyFilesExist=fileSources.pyExists;
				libFilesExist=fileSources.libExists;
			}
			// if either type is not valid, need to turn off lighting
			if(!pyFilesExist){
				statusBarItem1.backgroundColor=undefined;
			}
			if(!libFilesExist){
				statusBarItem2.backgroundColor=undefined;
			}
			// see if file event was in the specs, libs don't show up here since not edited
			// note this won't be found if pyFilesExist is false
			const foundEl=cpFileLines.some(lne => !lne.inLib && uri.fsPath.toLowerCase().endsWith(lne.src.toLowerCase()));
			if(foundEl){
				statusBarItem1.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
			}
			//now check whether change was in cpfiles itself, if so and flags are on, light up
			// ** currently will always be only cpfiles but check anyway
			if(uri.fsPath.toLowerCase().endsWith(strgs_cpfiles)){
				if(pyFilesExist){
					statusBarItem1.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
				}
				if(libFilesExist){
					statusBarItem2.backgroundColor=new vscode.ThemeColor(strgs.btnLightBkgd);
				}
			}
			updateStatusBarItems();
			statusBarItem1.show();
			statusBarItem2.show();
		});

		context.subscriptions.push(fileListWatcher);
		context.subscriptions.push(fileListWatchChg);
		context.subscriptions.push(fileListWatchDelete);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
