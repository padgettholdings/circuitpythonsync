// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { QuickInputButton, ThemeIcon } from 'vscode';
//import * as drivelist from 'drivelist';
import * as drivelist from './drivelist'; // #74, use this for drive list
import * as os from 'os';
//#19, get strings
import * as strgs from './strings';
//import path, { win32 } from 'path';
import { fstat, writeFile,existsSync } from 'fs';
import { BoardFileExplorer,BoardFileProvider } from './boardFileExplorer';
import { LibraryMgmt } from './libraryMgmt';
import { StubMgmt } from './stubMgmt';
import { ProjectBundleMgmt } from './projectBundle';
// **#72, new full quick pick with buttons that can be used in commands like showQuickPick
import { showFullQuickPick,QuickPickParameters,shouldResume } from './fullQuickPick';

import { FileDecorator  } from './fileDecorator';

import * as axios from 'axios';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { UploadUf2 } from './uploadUf2';
//import { isSet } from 'util/types';

//import { chdir } from 'process';
//import { loadEnvFile } from 'process';

//import { Dirent } from 'fs';

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
let strgs_mngFileChooseFiles:string=strgs.mngFileChooseFiles;
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
// #73, status bar button to map drive
let statusBarMapDrv: vscode.StatusBarItem;

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
// AND only do standard folders
let confirmDnldOverwrite:boolean;
let confirmDnldSkipDots:boolean;
let confirmDnldStdFoldersOnly:boolean;

// ** #68 make libmgmt and stubmgmt global so can use in other modules **
let libMgmtSys:LibraryMgmt;
let stubMgmtSys:StubMgmt;

// ** Global function to update file decorations, set during activate **
let globalUpdateFileDecorations: ((cpFileLines: Array<cpFileLine>) => Promise<void>) | null = null;

//define quick pick type for drive pick
interface drivePick extends vscode.QuickPickItem {
	path: string
}

//need cache of drives from drivelist, first define type
// #63 - add other props from systeminfo
interface drvlstDrive {
	drvPath: string;
	isUsb: boolean;
	volumeLabel?: string;
	isRemovable?: boolean;
}

//now the last drives queried
let lastDrives:drvlstDrive[]=Array<drvlstDrive>(0);

// **#72, quick pick command buttons
const iconCommandHelp:ThemeIcon=new ThemeIcon('question');
interface cmdQuickInputButton extends QuickInputButton {
	commandName: string;
}
// also need a narrowing test for buttons of this type for the full quick pick
function isCmdQuickInputButton(button: any): button is cmdQuickInputButton {
	return (button as cmdQuickInputButton).commandName !== undefined;
}

// ALSO need a cache of detected drives managed by the DriveList module
//let detectedDrives: drivelist.detectedDrive[] = [];

//interface for cpfiles parsed line
// ** #37, add field to preserve orig line
interface cpFileLine {
	src: string,
	dest: string,
	inLib: boolean,
	origLine?:string | undefined
}

// ** #125, var in this session to not ask again about editing cpfiles.txt
let cpfilesEditNoAskAgain:boolean=false;

// parse cpfiles.txt into lines
// schema is:
//	src | src->dest | lib/src | lib/src -> dest (dest in lib implied) | lib/src -> lib/dest
async function parseCpfiles(preserveComments:boolean=false): Promise<cpFileLine[]>  {
	let outLines:cpFileLine[]=Array<cpFileLine>(0);
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return outLines;}
	const relPat=new vscode.RelativePattern(wsRootFolder,`.vscode/${strgs_cpfiles}`);
	const fles=await vscode.workspace.findFiles(relPat);
	if(fles.length>0){
		//cpfiles exists, read and split into lines
		let fil=await vscode.workspace.fs.readFile(fles[0]);
		let sfil=fromBinaryArray(fil);
		// ** use a platform agnostic line split 
		const lines:string[]= sfil.split(/\r?\n|\r/);
		let fromFile:string='';
		let toFile:string='';
		let inLib:boolean=false;
		let origLine:string='';
		if(lines) {
			for(const lineOrig of lines) {
				// ** #37, don't process comments which start with #, 
				//	BUT save in the output if preserve arg is set.
				//  Only used by manage cpfiles routine to re-write originals
				//	if you need to have file starting with # use \#
				//	the leading backslash will be removed
				origLine=lineOrig;
				if(lineOrig.startsWith('#')){
					if(preserveComments!==undefined && preserveComments){
						outLines.push(
							{
								src:'',
								dest:'',
								inLib: false,
								origLine:origLine
							}
						);
					}
					continue;
				}
				let _lineOrig=lineOrig;
				/*
				if(_lineOrig.startsWith('\\#')){
					_lineOrig=_lineOrig.slice(1);
				}
				*/
				const fromTo:string[]=_lineOrig.split('->');
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
	filesNoExist: boolean,
	invalidPyFiles: boolean,
	invalidLibFiles: boolean
}

//determine if files from cpFilesLine[] exist in either root or lib folder
// ** should only call if have something in arg but will work, just always returns pyExists=false and libExists=true
// ** assumes libraryFolderExists has been set
// ** per #26, also looks in cplines to see if none of the non-lib files are .py, and whether any filenames no exist
async function checkSources(cpLines:cpFileLine[]):Promise<fileStates> {
	// ** #95 - add flags for invalid py and lib entries, just to use in cpfiles mgmt.
	let retVal:fileStates={
		pyExists: false,
		libExists: false,
		noPyFiles: false,
		filesNoExist: false,
		invalidPyFiles: false,
		invalidLibFiles: false
	};
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return retVal;}
	// ** #115 - cplines may have folder/file entries, filter them out first, then process later
	const cpLinesNoFolders=cpLines.filter(lne => !lne.src.includes('/'));
	//first the py (really any source) files in root
	const rootDir=await vscode.workspace.fs.readDirectory(wsRootFolder.uri);
	if(rootDir.length>0){
		const anyValidfilesInDir=cpLinesNoFolders.some((cpfle:cpFileLine,index,ary) => {
			return !cpfle.inLib && rootDir.some(dfile => dfile[0]===cpfle.src && dfile[1]===vscode.FileType.File);
		});
		// if got some non lib files, return flag that is used to say SOME valid files exist
		if(anyValidfilesInDir){
			retVal.pyExists=true;
		}
		//now check the files independently for #26 conditions
		// ** #123, check src and dest lines to see if any code files
		const gotPyFile=cpLinesNoFolders.some(cpFileLine => !cpFileLine.inLib && (cpFileLine.src.endsWith(".py") || cpFileLine.dest.endsWith(".py")));
		if(!gotPyFile) { retVal.noPyFiles=true; }
		const allExist=cpLinesNoFolders.filter(lne => !lne.inLib).every((cpFileLine) => {
			return rootDir.some(dfile =>  dfile[0]===cpFileLine.src && dfile[1]===vscode.FileType.File);
		});
		if(!allExist) { retVal.filesNoExist=true; }

	}
	//now see if any files marked lib are in folder if it exists
	// BUT first see if any lib files are in lib folder OR if no lib files in cpfiles
	if(libraryFolderExists){
		//short circuit if no lib files in cpfiles, then "have" lib files, all of them!
		const gotLIbFiles=cpLinesNoFolders.some((lne:cpFileLine) => {
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
				const dirsInDir=cpLinesNoFolders.some((cpfle:cpFileLine,index,ary) => {
					return cpfle.inLib && libDir.some(entry => entry[0]===cpfle.src && entry[1]===vscode.FileType.Directory);
				});
				if(dirsInDir){
					retVal.libExists=true;
				} else {
					const filesInDir=cpLinesNoFolders.some((cpfle:cpFileLine,index,ary) => {
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
			// ** #95 - got lib entry but not found in dir, so flag it
			retVal.invalidLibFiles=true;
		}
	}
	// now process any entries with folder paths - NOTE only one level supported
	const cpLinesWithFolders=cpLines.filter(lne => lne.src.includes('/'));
	// if any entries with folders, check them
	if(cpLinesWithFolders.length>0){
		// ** two flags applicable:
		//  filesNoExist, set if any file in cpfiles does not exist in the non-lib workspace
		//  pyExists, which is set if any file is in cpfiles that exists in the non-lib workspace
		//  ** BUT, can't short circuit out unless BOTH already set because need to check each one they are independent
		if(!(retVal.filesNoExist && retVal.pyExists)) {
			// just check each entry to see if it exists using fs exists, since don't expect many
			let testFileUri:vscode.Uri;
			for(const cpFileLine of cpLinesWithFolders) {
				testFileUri=vscode.Uri.joinPath(wsRootFolder.uri,cpFileLine.src);
				if(!fs.existsSync(testFileUri.fsPath)){
					retVal.filesNoExist=true;
				} else {
					retVal.pyExists=true;
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
	// ** #37, cpLines has comment only lines to filter out
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

// ** #37, add utility to return real path to library
export async function getLibPath(): Promise<string>{
	let retVal:string="";
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return retVal;}
	// ** also should not call if lib folder doesn't exist, but this is for safety
	if(!libraryFolderExists) { return retVal;}
	//the rootDir array should have lib folder name, find it
	const rootDir=await vscode.workspace.fs.readDirectory(wsRootFolder.uri);
	const libName=rootDir.find((value:[string,vscode.FileType],index,ary) => {
		return value[1]===vscode.FileType.Directory && value[0].toLowerCase()==='lib';
	});
	retVal=libName ? libName[0] : "";
	return retVal;
}

// ** Function to handle lib folder creation from external modules
export async function onLibFolderCreated(): Promise<void> {
	// Update the library folder exists flag
	libraryFolderExists = true;
	
	// Parse cpfiles and update decorations if the function is available
	let cpFileLines = await parseCpfiles();
	// ** #133, need to add default py files before dec update
		if(!cpFileLines || cpFileLines.length===0 || !cpFileLines.some(lne => !lne.inLib)){
		//just put in default py files to check and no lib
		// #101, need to add defaults because there may be libs (and cpFileLines always has array)
		const cpFileLinesDfltPy=[
			{
				src:'code.py', dest:'',	inLib:false
			},
			{
				src: 'main.py',	dest: '', inLib: false
			}
		];
		cpFileLines=[...cpFileLines,...cpFileLinesDfltPy];
	}
	//
	if (globalUpdateFileDecorations) {
		await globalUpdateFileDecorations(cpFileLines);
	}
	
	// Update status bar items
	const fileSources = await checkSources(cpFileLines);
	if(fileSources.libExists) {
		libFilesExist = fileSources.libExists;
		statusBarItem2.backgroundColor = new vscode.ThemeColor(strgs.btnLightBkgd);
	} else {
		libFilesExist = false;
	}
	updateStatusBarItems();
}

// #76, add export functions to allow other modules to access the lib setup and stubs setup
export async function setupLibSources(onlyIfArchMissing:boolean): Promise<void> {
	if(libMgmtSys){
		if(!onlyIfArchMissing || !libMgmtSys.libArchiveExists()){
			try {
				await libMgmtSys.setupLibSources();
			} catch (error) {
				//report the error but continue
				vscode.window.showErrorMessage(strgs.setupLibGeneralError+getErrorMessage(error));
				libMgmtSys.stopLibUpdateProgress();
			}
		}
	}
}

export async function setupStubs(onlyIfArchMissing:boolean): Promise<void> {
	if (stubMgmtSys) {
		if (!onlyIfArchMissing || !stubMgmtSys.stubsArchiveExists()) {
			try {
				await stubMgmtSys.installStubs();
			} catch (error) {
				//report the error but continue
				vscode.window.showErrorMessage(strgs.installStubsGeneralError+getErrorMessage(error));
				stubMgmtSys.stopStubUpdateProgress();
			}
		}
	}
}



// ** #37 select list for files to go to board, similar to libraries
//checked list interface for lib
interface fileListSelect {
	src: string,
	dest: string,
	fullPath: string,
	selected: boolean,
	fType: vscode.FileType
}

async function getFileListSelect(cpLines:cpFileLine[]): Promise<fileListSelect[]>{
	// ** #37, cpLines has comment only lines to filter out
	// **Only works if workspace, but should not ever call this if not one **
	let retVal:fileListSelect[]=Array<fileListSelect>(0);
	const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
	if(!wsRootFolder) {return retVal;}
	// filter to just actual files, comments will be checked/merged by caller
	const cpLinesFiles=cpLines.filter(lne => !lne.inLib && lne.src);
	//read the root to be able to match files
	const fileDir=await vscode.workspace.fs.readDirectory(wsRootFolder.uri);
	//create the output array and match
	for(const entry of fileDir){
		// ** #115 - recurse down through non-lib and non settings dirs ** also not the archive folders
		const entryType:vscode.FileType=entry[1] as vscode.FileType;
		if(entryType===vscode.FileType.File){
			let curEntry:fileListSelect={
				src:entry[0],
				dest:"",
				fullPath:entry[0],
				selected:false,
				fType:entry[1]
			};
			const matchedCp=cpLinesFiles.find((value) => {
				return value.src===curEntry.src;
			});
			if(matchedCp){
				curEntry.dest=matchedCp.dest;
				curEntry.selected=true;
			}
			retVal.push(curEntry);
		} else if (entryType===vscode.FileType.Directory &&
				entry[0].toLowerCase()!=='lib' && entry[0].toLowerCase()!=='.vscode' &&
				entry[0]!==strgs.workspaceLibArchiveFolder && entry[0]!==strgs.stubArchiveFolderName &&
				entry[0]!==strgs.projectBundleArchiveFolderName && !entry[0].toLowerCase().startsWith('.git')) {
			// if it is a directory, then recurse down to get files in it *** one level only
			const subDirUri=vscode.Uri.joinPath(wsRootFolder.uri,entry[0]);
			const subDirContents=await vscode.workspace.fs.readDirectory(subDirUri);
			for(const subEntry of subDirContents){
				if(subEntry[1]===vscode.FileType.File){
					let curEntry:fileListSelect={
						src:subEntry[0],
						dest:"",
						fullPath:entry[0]+'/'+subEntry[0],
						selected:false,
						fType:subEntry[1]
					};
					const matchedCp=cpLinesFiles.find((value) => {
						return value.src===curEntry.fullPath;
					});
					if(matchedCp){
						curEntry.dest=matchedCp.dest;
						curEntry.selected=true;
					}
					retVal.push(curEntry);
				}
			}
		}
	}


	return retVal;
}

// ** #115, utility to parse non-lib and non-root cpfile entry to path and filename
export function parseCpFilePath(cpFileLine:cpFileLine): {path:string, fileName:string} {
	// ** #115, cpFileLine has src and dest, but dest is not used here
	// if src is empty, return empty path and filename
	if(!cpFileLine.src || cpFileLine.src.length===0) {
		return {path:'', fileName:''};
	}
	// if src has a / then it is a path, split it
	const pathParts=cpFileLine.src.split('/');
	let retPath:string='';
	let retFileName:string='';
	if(pathParts.length>1){
		//multiple parts, last is file name
		retFileName=pathParts.pop() ?? '';
		retPath=pathParts.join('/');
	} else {
		//just one part, it is the file name
		retFileName=pathParts[0];
	}
	return {path:retPath, fileName:retFileName};
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
					isUsb: drv.isUSB ?? false,
					volumeLabel: drv.volumeLabel ?? '',
					isRemovable: drv.isRemovable ?? false
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

// **#36- need access to cur drive setting from views
export function getCurrentDriveConfig(): string {
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

// **interface and parsing of circuitpython project template file**
interface cpProjTemplateItem {
	folderName:string,
	fileName:string,
	fileContent:string
}

let cpProjTemplate:cpProjTemplateItem[]=Array<cpProjTemplateItem>(0);
// ** #60, add a default project template that can be used when needed
let cpProjTemplateDefault:cpProjTemplateItem[]=Array<cpProjTemplateItem>(0);
let projTemplatePath:string='';	//** #57, make path global so that can use in make project quick pick

// ** #60, convert to function that returns the array
function parseCpProjTemplate(templateFileContents:string): cpProjTemplateItem[] {
	// clear the array
	let cpProjTemplateTemp=Array<cpProjTemplateItem>(0);
	// first break into lines
	// ** this needs to be platform agnostic, so use better RE
	//const tlines:string[]=templateFileContents.split(/\n/);
	const tlines:string[]=templateFileContents.split(/\r?\n|\r/);
	if(tlines.length===0){return cpProjTemplateTemp;}	//no data
	//now go through the lines
	let cpItem:cpProjTemplateItem | undefined=undefined;
	for(let line of tlines){
		// if not in an item must get >>> start segment first, cycle through if not
		if(!line.startsWith('>>>') && cpItem){
			//add the line to content
			cpItem.fileContent+=line+'\n';
		} else {
			if(line.startsWith('>>>')){
				// if already have an item, end it and add to array
				if(cpItem){
					cpProjTemplateTemp.push(cpItem);
				}
				//start a new cpitem
				cpItem={
					folderName:'/',
					fileName:'',
					fileContent:''
				};
				line=line.substring(3);
				const fldrPath=line.split('/');
				if(fldrPath.length===1){
					cpItem.fileName=fldrPath[0];
				}
				if(fldrPath.length>1){
					// ** #70- allow for multi-level folders
					// clear out the default root folder name
					cpItem.folderName='';
					for(let ix=0; ix<fldrPath.length; ix++){
						if(ix<fldrPath.length-1){
						cpItem.folderName+=fldrPath[ix]+(ix<fldrPath.length-2 ? '/':'');
						} else {
							//last segment can be either filename or folder
							if(fldrPath[ix].length>0){
								cpItem.fileName=fldrPath[ix];
							} else {
								//if last segment is empty, then it is a folder
								//cpItem.folderName+= '/'+fldrPath[ix];
							}
						}
					}
						
					// cpItem.folderName=fldrPath[0];
					// if(fldrPath[1]){
					// 	cpItem.fileName=fldrPath[1];
					// }
				}
			} else {
				//just flywheel through until start header
				continue;
			}
		}
	}
	//if active item, add to array 
	if(cpItem){
		cpProjTemplateTemp.push(cpItem);
	}
	return cpProjTemplateTemp;
}

// ** #57, get the override project template text from file or URL in setting
async function getProjTemplateText(): Promise<string> {
	let retVal:string='';
	const cpsyncSettings=vscode.workspace.getConfiguration('circuitpythonsync');
	// ** #57, make path global so that can use in make project quick pick
	//  **This picks up the current/last setting, which may be changed in the UI, and this will be called again
	projTemplatePath=cpsyncSettings.get(strgs.confCPTemplatePathPKG,'');
	//projTemplatePath='file:/home/stan/testextensions/mynewcpproject.txt';
	//if empty, return empty
	if(!projTemplatePath) {return retVal;}
	//if file, read it
	if(projTemplatePath.startsWith('https:')){  //if URL, get it, must be ssl
		// ** #57, add URL fetch
		const projTemplatePathUri=vscode.Uri.parse(projTemplatePath);	//just to check validity and if it is github
		// if ref is to github will use authenticated fetch if login is set
		if(projTemplatePathUri.authority.toLowerCase().endsWith('github.com') ||
			projTemplatePathUri.authority.toLowerCase().endsWith('githubusercontent.com')) {
			//just try to get the github auth
			// const session = await vscode.authentication.getSession(
			// 	'github',
			// 	['repo'],
			// 	{ createIfNone: false }
			// );
			const session = await vscode.authentication.getSession(
				'github',
				['repo'],
				{ createIfNone: true }
			);
			if(session){
				const token=session.accessToken;
				// download the contents of the file from github using axios
				try {
					// const response=await axios.default(
					// 	{
					// 		method: 'get',
					// 		url: projTemplatePath+"?token="+token,
					// 		responseType: 'text'
					// 	}
					// );
					const response = await axios.default.get(projTemplatePath, {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Accept': 'application/vnd.github.v3.raw',
							'X-GitHub-Api-Version': '2022-11-28'	
						}
					});
					retVal=response.data;
				} catch (err) {
					console.log('Error downloading file from GitHub:', err);
					vscode.window.showErrorMessage(strgs.projTemplateGHNoLoad+getErrorMessage(err));
				}
			}
		} else {
			//not github, just try to get it
			try {
				const response = await axios.default.get(projTemplatePath, {
					responseType: 'text'
				});
				retVal=response.data;
			} catch (err) {
				console.log('Error downloading file from URL:', err);
				vscode.window.showErrorMessage(strgs.projTemplatePersNoLoad+getErrorMessage(err));
			}
		}
	} else {
		// assume it is a file, if windows add the file scheme explicitly
		if (os.platform()==='win32') {
			projTemplatePath='file:'+projTemplatePath;
		}
		// parse path to see if scheme is file and no error occurs
		let projTemplatePathUri:vscode.Uri | undefined=undefined;
		try{
			projTemplatePathUri=vscode.Uri.parse(projTemplatePath);
		} catch {
			//just let it be undefined and will bail
			projTemplatePathUri=undefined;
		}
		if(projTemplatePathUri && projTemplatePathUri.scheme=== 'file'){
			try{
				const templateContentBytes=await vscode.workspace.fs.readFile(projTemplatePathUri);
				retVal=fromBinaryArray(templateContentBytes);
			} catch(err) {
				console.log(strgs.projTemplatePersNoLoad,err);
				vscode.window.showErrorMessage(strgs.projTemplatePersNoLoad+getErrorMessage(err));
				retVal='';	//make sure return is empty, also check at end to reset config
			}
		} else {
			// likely invalid path on this platform, flag error the same way as bad file
			console.log(strgs.projTemplatePersNoLoad,strgs.projTemplateNoLoadUriErrCode);
			vscode.window.showErrorMessage(strgs.projTemplatePersNoLoad+strgs.projTemplateNoLoadUriErrCode);
			retVal='';	//make sure return is empty, also check at end to reset config
		}
	}
	// if return is empty then blank the project template path so becomes the default
	if(!retVal || retVal.length===0){
		projTemplatePath='';
		// this had to be a reset since would not be here if was originally blank, so reset config
		await cpsyncSettings.update(strgs.confCPTemplatePathPKG,projTemplatePath,vscode.ConfigurationTarget.Global);
	}
	return retVal;
}

// ** update both status bar buttons
async function updateStatusBarItems() {
	if(curDriveSetting===''){
		//no drive mapped, put error icon in text of both
		statusBarItem1.text=`${strgs.btnCopyLbl} $(error)`;
		statusBarItem2.text=`${strgs.btnLibLbl} $(error)`;
		//and the right tooltip
		statusBarItem1.tooltip=new vscode.MarkdownString(strgs.btnFilesTTPrefixMKDN+strgs.mustMapMKDN);
		statusBarItem2.tooltip=new vscode.MarkdownString(strgs.btnLibsTTPrefixMKDN+strgs.mustMapMKDN);
	} else {
		//NEXT see if have valid files to copy, if not show no sync
		//NOTE will need to short circuit further actions on these exists flags
		if(!pyFilesExist) {
			statusBarItem1.text=`${strgs.btnCopyLbl} $(sync-ignored)`;
			statusBarItem1.tooltip=new vscode.MarkdownString(strgs.btnFilesTTPrefixMKDN+strgs.noFilesMKDN);
		}
		if(!libFilesExist){
			statusBarItem2.text=`${strgs.btnLibLbl} $(sync-ignored)`;
			statusBarItem2.tooltip=new vscode.MarkdownString(strgs.btnLibsTTPrefixMKDN+strgs.noFilesMKDN);
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
				statusBarItem1.tooltip=new vscode.MarkdownString(strgs.btnFilesTTPrefixMKDN+strgs_cpBootNoFindMKDN);
			}
			if(libFilesExist){
				statusBarItem2.text=`${strgs.btnLibLbl} $(warning)`;
				//and the right tooltip
				statusBarItem2.tooltip=new vscode.MarkdownString(strgs.btnLibsTTPrefixMKDN+strgs_cpBootNoFindMKDN);
			}
		} else {
			//Try to see if location of boot file matches one of the drives but not usb
			//	then can use the $(info) icon with a warning
			//SO logic is if no lastDrives or curDriveSetting is NOT in array or if it is in array
			//  but is not USB add the info icon with tooltip. Else normal copy enabled.
			let gotValidDrive:boolean=true;
			if(lastDrives){
				let validDrive=lastDrives.find((value:drvlstDrive,index,ary) => {
					return (curDriveSetting===value.drvPath && value.volumeLabel?.toLowerCase()==='circuitpy');		// no longer using value.isUsb);
				});
				gotValidDrive=validDrive ? true : false;
			} 
			if(gotValidDrive) {
				if(pyFilesExist){
					statusBarItem1.text=strgs.btnCopyLbl;
					statusBarItem1.tooltip=new vscode.MarkdownString(strgs.btnFilesTTPrefixMKDN+strgs.enabledToCopyMKDN+curDriveSetting);
				}
				if(libFilesExist){
					statusBarItem2.text=strgs.btnLibLbl;
					statusBarItem2.tooltip=new vscode.MarkdownString(strgs.btnLibsTTPrefixMKDN+strgs.enabledToCopyMKDN+curDriveSetting);
				}
			} else {
				if(pyFilesExist){
					statusBarItem1.text=`${strgs.btnCopyLbl} $(info)`;
					statusBarItem1.tooltip=new vscode.MarkdownString(strgs.btnFilesTTPrefixMKDN+strgs.canCopyInsCurDriveMKDN[0]+curDriveSetting + strgs.canCopyInsCurDriveMKDN[1]);
				}
				if(libFilesExist){
					statusBarItem2.text=`${strgs.btnLibLbl} $(info)`;
					statusBarItem2.tooltip=new vscode.MarkdownString(strgs.btnLibsTTPrefixMKDN+strgs.canCopyInsCurDriveMKDN[0]+curDriveSetting + strgs.canCopyInsCurDriveMKDN[1]);
				}
			}
		}
	}
	//?? do we do show here??
}

// utility to get message from error
function getErrorMessage(error: any): string {
	if (error instanceof Error) {
		return error.message;
	} else if (typeof error === 'string') {
		return error;
	} else {
		return 'An unknown error occurred';
	}
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
	const strgs_cpfilesTry=cpsyncSettings.get(strgs.confCPFilesNamePKG);
	if(strgs_cpfilesTry){
		//got setting, put use as active
		strgs_cpfiles=strgs_cpfilesTry as string;
	}
	// set current into global
	cpsyncSettings.update(strgs.confCPFilesNamePKG,strgs_cpfiles,true);
	
	const strgs_cpfilesbakTry=cpsyncSettings.get(strgs.confCPFilesNameBakPkg);
	if(strgs_cpfilesbakTry){
		//got setting, put use as active
		strgs_cpfilesbak=strgs_cpfilesbakTry as string;
	}
	//set current into global
	cpsyncSettings.update(strgs.confCPFilesNameBakPkg,strgs_cpfilesbak,true);
	
	const strgs_cpBootFileTry=cpsyncSettings.get(strgs.confCPBootFilenamePKG);
	if(strgs_cpBootFileTry){
		//got setting, put use as active
		strgs_cpBootFile=strgs_cpBootFileTry as string;
	}
	//did not find so set current into global
	cpsyncSettings.update(strgs.confCPBootFilenamePKG,strgs_cpBootFile,true);
	
	//vscode.window.showInformationMessage(`active cpfiles setting is: ${strgs_cpfiles}`);
	//vscode.window.showInformationMessage(`active cpfilesbak setting is: ${strgs_cpfilesbak}`);
	//vscode.window.showInformationMessage(`active cpbootfile setting is: ${strgs_cpBootFile}`);
	// ** and get revised messages **
	[strgs_noWriteCpfile,strgs_mngLibChooseLibs,strgs_mngFileChooseFiles,strgs_noCodeFilesInCp,strgs_noPyCodeFilesInCp,strgs_fileInCpNoExist,strgs_noPyAndNonExistFilesInCp,strgs_warnNoLibsInCP]=strgs.getCpFilesMsgs(strgs_cpfiles);
	//vscode.window.showInformationMessage('one of revised cpfiles messages: '+strgs_noCodeFilesInCp);
	[strgs_cpBootNoFindMKDN]=strgs.getCpBootMsgs(strgs_cpBootFile);
	//vscode.window.showInformationMessage('revised cp boot file msg: '+strgs_cpBootNoFindMKDN);

	// ** try to get template file and parse it
	let templateContent:string='';
	// ** #60, always get the default project template into the default array, may also use in main
	//const fullTemplPath=context.asAbsolutePath(path.join('resources','cptemplate.txt'));
	const fullTemplPathUri=vscode.Uri.joinPath(context.extensionUri,'resources/cptemplate.txt');
	//vscode.window.showInformationMessage("cp proj template path: "+fullTemplPathUri.fsPath);
	try{
		const templateContentBytes=await vscode.workspace.fs.readFile(fullTemplPathUri);
		templateContent=fromBinaryArray(templateContentBytes);
	} catch {
		console.log(strgs.projTemplateNoLoad);
		vscode.window.showErrorMessage(strgs.projTemplateNoLoad);
		templateContent='';
	}
	if(templateContent){
		cpProjTemplateDefault=parseCpProjTemplate(templateContent);
	}
	// ** #57, get the override project template text from file or URL in setting
	const projTemplateText=await getProjTemplateText();
	if(projTemplateText){
		templateContent=projTemplateText;
	}
	if(templateContent){
		cpProjTemplate = parseCpProjTemplate(templateContent);
	}

	// ** #88 - add virtual doc provider to show raw templates
	const vtScheme:string='cpstemplate';
	const vtProvider=new class implements vscode.TextDocumentContentProvider {
		async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
			let retval='';
			retval=await getProjTemplateText();
			// if empty is the default, use that
			if(!retval){
				const fullTemplPathUri=vscode.Uri.joinPath(context.extensionUri,'resources/cptemplate.txt');
				//vscode.window.showInformationMessage("cp proj template path: "+fullTemplPathUri.fsPath);
				try{
					const templateContentBytes=await vscode.workspace.fs.readFile(fullTemplPathUri);
					retval=fromBinaryArray(templateContentBytes);
				} catch {
					console.log(strgs.projTemplateNoLoad);
					vscode.window.showErrorMessage(strgs.projTemplateNoLoad);
					return '';
				}
			}
			return retval;
		}
	};
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(vtScheme, vtProvider)
	);

	function encodePngToBase64Node(filePath: string): string {
		try {
			const fileBuffer = fs.readFileSync(filePath);
			const base64String = fileBuffer.toString('base64');
			const mimeType = 'image/png';
			return `data:${mimeType};base64,${base64String}`;
		} catch (error) {
			console.error('Error reading or encoding the file:', error);
			throw error;
		}
	}
	
	// **#72 - virt doc provider for help files
	const helpScheme:string='cpshelp';
	const helpProvider=new class implements vscode.TextDocumentContentProvider {
		async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
			let retval='';
			const fullTemplPathUri=vscode.Uri.joinPath(context.extensionUri,'resources',uri.path);
			//vscode.window.showInformationMessage("cp proj template path: "+fullTemplPathUri.fsPath);
			try{
				const docContentBytes=await vscode.workspace.fs.readFile(fullTemplPathUri);
				retval=fromBinaryArray(docContentBytes);
				// ** #72 - find image tags in markdown and convert to data URI
				const imgTagRE=/!\[.*?\]\((.*?)\)/g;
				retval=retval.replace(imgTagRE,(match, p1) =>  {
					const imgPath=vscode.Uri.joinPath(context.extensionUri,'resources',p1);
					const imgData=encodePngToBase64Node(imgPath.fsPath);
					return match.replace(p1,imgData);
				});
			} catch {
				console.log('error loading help');
				vscode.window.showErrorMessage(strgs.helpFileLoadErr);
				return '';
			}
		
			return retval;
		}
	};
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(helpScheme, helpProvider)
	);





	// ** spin up the library management
	/*
	const libMgmtSys=new LibraryMgmt(context);
	// now call the constructor if have workspace
	if(haveCurrentWorkspace){
		libMgmtSys.setup();	//don't need to wait
	}
	*/


	const helloWorldId:string=strgs.cmdHelloPKG;
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand(helloWorldId, async (helpDocLink?:string) => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		if(haveCurrentWorkspace) {
			//vscode.window.showInformationMessage('Hello from CircuitPythonSync- workspace active!');
			//#####TEST#### create a webview panel to get resource path
			// const panel = vscode.window.createWebviewPanel('circuitpythonsync', 'CircuitPythonSync', vscode.ViewColumn.One, { enableScripts: true });
			// const imageUri=vscode.Uri.joinPath(context.extensionUri, 'resources', 'cpstoolbarsmall.png');
			// const wvref=panel.webview.asWebviewUri(imageUri);
			//######TEST#####
			// **#72 - show help doc
			let helpDocLinkStr:string=helpDocLink ? "\#"+helpDocLink : '';
			const helpuri=vscode.Uri.parse(helpScheme+':'+strgs.helpFilename+helpDocLinkStr);
			//const helpuri=vscode.Uri.joinPath(context.extensionUri,'resources','helpfile.md'+helpDocLinkStr);
			//const helpdoc=await vscode.workspace.openTextDocument(helpuri);
			//const textEd=await vscode.window.showTextDocument(helpdoc);
			//const close_other_editor_command_id = "workbench.action.closeEditorsInOtherGroups";
			const markdown_preview_command_id = "markdown.showPreview";
			//await vscode.commands.executeCommand(close_other_editor_command_id);
			await vscode.commands.executeCommand(markdown_preview_command_id,helpuri);
			//await vscode.window.showTextDocument(helpdoc);
			//await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			// vscode.commands.executeCommand(close_other_editor_command_id)
			// .then(() => vscode.commands.executeCommand(markdown_preview_command_id))
			// .then(() => {}, (e) => console.error(e));
		
		} else {
			vscode.window.showInformationMessage(strgs.helloWorldNoWkspc);
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
			vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
			return;
		}
		//copy rules:
		//- defaults to non-lib files in cpfiles first
		//- if not look for code.py first, then main.py
		// ** always overwrite but no deletes
		const wsRootFolder=vscode.workspace.workspaceFolders?.[0];
		if(!wsRootFolder){return;}	// will never return since we know we are in workspace
		const cpFileLines=await parseCpfiles();
		// ** #37, DON'T need to filter out the comment lines that have just comment because did not preserve
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
		// ** setup and show progress indicator
		let progInc=0;
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Copy Progress",
			cancellable: true
		}, (progress, token) => {
			token.onCancellationRequested(() => {
				console.log("User canceled the long running operation");
			});
			progress.report({ increment: 0 });
			const p = new Promise<void>(resolve => {
				const intvlId=setInterval(() => {
					progress.report({increment:progInc,message:'Copying files...',});
					if(progInc>=100){
						clearInterval(intvlId);
						resolve();
					}
				},500);
				setTimeout(() => {
					clearInterval(intvlId);
					resolve();
				}, 10000);	// ****** TBD ****** how to set max timeout
			});
			return p;
		});
		//calc progress counts
		const progStep=100/(cpCodeLines.length===0 ? 1 : cpCodeLines.length);
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
				progInc+=progStep;
			} else if(codeFile.src.includes('/')) {
				// is a subfolder, parse and try to copy
				const parsedPath=parseCpFilePath(codeFile);
				if(parsedPath.path && parsedPath.fileName){
					// need to check if the source exists
					srcUri=vscode.Uri.joinPath(wsRootFolderUri,parsedPath.path,parsedPath.fileName);
					if(fs.existsSync(srcUri.fsPath)){
						// now try to copy to the same folder on the board
						destUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),parsedPath.path,codeFile.dest==='' ? parsedPath.fileName : codeFile.dest);
						try {
							await vscode.workspace.fs.copy(srcUri,destUri,{overwrite:true});
							copiedFilesCnt+=1;
						}
						catch (error) {
							const fse:vscode.FileSystemError=error as vscode.FileSystemError;
							//******* give the error but continue */
							vscode.window.showErrorMessage(strgs.errorCopyingFile+fse.message);
							//see if it was code py file, if so reset the did copy...
							errorFileCnt+=1;
						}
						progInc+=progStep;
					} else {
						skippedFilesCnt+=1;
						progInc+=progStep;
					}
				}
				else {
					skippedFilesCnt+=1;
					progInc+=progStep;
				}
			} else {
				skippedFilesCnt+=1;
				progInc+=progStep;
			}
		}
		//just make sure progress is gone
		progInc=101;
		vscode.window.showInformationMessage(`Copy done: ${copiedCodeOrMainPy ? 'DID' : 'DID NOT'} copy python file.  ${copiedFilesCnt.toString()} files copied. ${skippedFilesCnt.toString()} files skipped. ${errorFileCnt.toString()} files errored.`);
		statusBarItem1.backgroundColor=undefined;
		// ** #36, refresh the board explorer
		bfe.boardFileProvider.refresh(curDriveSetting);
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
			vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibsCopySupport);
			return;
		}
		//#16, add confirmation if entire library is to be copied
		//read the cpfiles to see if no specs so whole library is the source...
		//but only if confirmation turned off
		const cpFileLines=await parseCpfiles();	//will need this later too
		// ** note that #37 comment lines don't affect lib lines, and didn't ask to preserve
		let copyFullLibFolder=false;	//for later too
		if(cpFileLines.length===0 || !cpFileLines.some(lne => lne.inLib)){
				//yes, whole lib to be copied, confirm
				copyFullLibFolder=true;
		}
		if(copyFullLibFolder && confirmFullLibCopy){
				const confAns=await vscode.window.showWarningMessage(strgs.warnEntireLib,"Yes","No, cancel","Yes, don't ask again","Help");
				if(!confAns || confAns==="No, cancel"){
					return;
				}
				if(confAns==="Yes, don't ask again") {
					confirmFullLibCopy=false;
				} else if (confAns==="Help") {
					vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibsCopySupport);
					return;
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
		// go ahead and setup the lib directories
		const srcLibUri=vscode.Uri.joinPath(wsRootFolder.uri,srcLibPath);
		const destLibUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),deviceCpLibPath);
		const libDir=await vscode.workspace.fs.readDirectory(srcLibUri);
		// ** setup and show progress indicator
		let progInc=0;
		let progStep=10;	//will get reset by which copy is done
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Copy Progress",
			cancellable: true
		}, (progress, token) => {
			token.onCancellationRequested(() => {
				console.log("User canceled the long running operation");
			});
			progress.report({ increment: 0 });
			const p = new Promise<void>(resolve => {
				const intvlId=setInterval(() => {
					progress.report({increment:progInc,message:'Copying libraries...',});
					if(progInc>=100){
						clearInterval(intvlId);
						resolve();
					}
				},500);
				setTimeout(() => {
					clearInterval(intvlId);
					resolve();
				}, 10000);	// ****** TBD ****** how to set max timeout
			});
			return p;
		});
		//
		if(copyFullLibFolder){
			//calc prog step and setup interval for faking progress on full lib copy, max 10 secs
			progStep=100/(libDir.length===0 ? 1 : libDir.length);
			const fakeStepTimer=setInterval(() => {
				progInc+=progStep;
				if(progInc>=100){
					clearInterval(fakeStepTimer);
				}
			}, 1000);
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
				// ** get rid of the progress bar
				progInc=101;
				// ** give copied notice here of just whole library
				vscode.window.showInformationMessage(strgs.wholeLibCopyDone);
			} else {
				return;  //should never!!
			}
		} else {
			//iterate through the cplines
			let srcUri:vscode.Uri;
			let destUri:vscode.Uri;
			//const srcLibUri=vscode.Uri.joinPath(wsRootFolder.uri,srcLibPath);
			//const destLibUri=vscode.Uri.joinPath(vscode.Uri.parse(baseUri),deviceCpLibPath);
			//const libDir=await vscode.workspace.fs.readDirectory(srcLibUri);
			//calc progress counts
			progStep=100/(cpLibLines.length===0 ? 1 : cpLibLines.length);
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
					progInc+=progStep;
				} else {
					skippedFilesCnt+=1;
					progInc+=progStep;
				}
			}
			vscode.window.showInformationMessage(`Lib Copy done with ${copiedFilesCnt.toString()} files copied, ${skippedFilesCnt.toString()} files skipped, ${errorFileCnt.toString()} files errored.`);
		}
		//just make sure progress is gone
		progInc=101;
		statusBarItem2.backgroundColor=undefined;
		// ** #36, refresh the board explorer
		bfe.boardFileProvider.refresh(curDriveSetting);

	});
	
	context.subscriptions.push(sbItemCmd2);

	//custom object for pick to save src only
	interface libSelPick extends vscode.QuickPickItem {
		src:string,
		dest:string
	}

	const mngCpLibsId:string=strgs.cmdMngLibPKG;
	//#15, command to manage cpfiles library settings
	const cmdMngLibSettings=vscode.commands.registerCommand(mngCpLibsId, async () => {
		//if no workspace do nothing but notify
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		// #95, at this point either lib files OR invalid in cpfiles, but that should continue
		const cpLinesTest=await parseCpfiles();
		const fileSources=await checkSources(cpLinesTest);
		if(!fileSources.libExists && !fileSources.invalidLibFiles) {
			vscode.window.showInformationMessage(strgs.noLibDir);
			return;
		}
		//now  re-read the current cpfile, preserving comments
		// ** #37, preserve the comments
		const cpLines=await parseCpfiles(true);
		//then get the current merged list
		let libListSelects=await getlibListSelect(cpLines);
		//now create a list of quickpicks
		// construct themeicons to use in pick instead of literals
		const fileIcon:vscode.ThemeIcon=new vscode.ThemeIcon("file");
		const folderIcon:vscode.ThemeIcon=new vscode.ThemeIcon("folder");
		let picks:libSelPick[]=Array<libSelPick>(0);
		// ** #37, make list of comments and use to annotate matches and add back in later
		const cpLinesComments=cpLines.filter(lne => lne.origLine && lne.origLine!=='');
		for(const libSel of libListSelects) {
			const cpLineMatch=cpLinesComments.find((cmt) => {
				const cmtSrcOnly=cmt.origLine?.slice(1).trim().split('->')[0].trim();
				return (cmtSrcOnly && cmtSrcOnly===libSel.fullPath);
			});
			let cpLineMatchDest='';
			if(cpLineMatch && cpLineMatch.origLine && cpLineMatch.origLine.includes('->')){
				cpLineMatchDest=cpLineMatch.origLine.slice(1).trim().split('->')[1].trim();
			}
			const pick:libSelPick={
				label: libSel.fullPath + (libSel.dest ? " -> "+libSel.dest : ""),
				picked:libSel.selected,
				iconPath:(libSel.fType===vscode.FileType.File ? fileIcon : folderIcon),
				src:libSel.src,
				dest:libSel.dest,
				description: 
					cpLineMatch ? (cpLineMatchDest ? ' -> '+cpLineMatchDest : '') +' $(close) '+strgs.pickCommentFlag : ''
			};
			picks.push(pick);
		}
		// const pickOpt:vscode.QuickPickOptions={
		// 	canPickMany:true,
		// 	placeHolder: strgs.mngLibChecks,
		// 	title: strgs_mngLibChooseLibs
		// };
		const helpButton:cmdQuickInputButton={
			iconPath:iconCommandHelp,
			tooltip:strgs.helpTooltipMap.get(strgs.helpLibsCopySupport),
			commandName:'help'
		};
		// const newChoices=await vscode.window.showQuickPick<libSelPick>(picks,
		// 	{title:strgs_mngLibChooseLibs, placeHolder:strgs.mngLibChecks, canPickMany:true}
		// );
		const qpLibCopyChoices=vscode.window.createQuickPick<libSelPick>();
		qpLibCopyChoices.items=picks;
		qpLibCopyChoices.selectedItems=picks.filter(pick => pick.picked);
		qpLibCopyChoices.title=strgs_mngLibChooseLibs;
		qpLibCopyChoices.placeholder=strgs.mngLibChecks;
		qpLibCopyChoices.canSelectMany=true;
		qpLibCopyChoices.buttons=[helpButton];
		qpLibCopyChoices.onDidTriggerButton((button) => {  
			const btn=button as cmdQuickInputButton;
			if (btn.commandName === 'help') {
				qpLibCopyChoices.hide();
				// show the help page
				vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibsCopySupport);
			}
		}); 	
		qpLibCopyChoices.onDidAccept(async () => {
			// get the selected items
			const newChoices=qpLibCopyChoices.selectedItems;
			if(newChoices){
				let prsvDestWCmts:boolean=false;	//if true, use/remove comments to keep destinations
				//the return is only the new picks, all others in cpfiles should be deleted
				//just format the file again from cpLines and newChoices
				// **BUT, if cplines had dest and it is NOT in choices, give warning and choice to stop **
				if(
					cpLines.some((cpl) => {
						return (cpl.inLib && cpl.dest && !newChoices.some(nc => nc.src===cpl.src));
					})
				){
					let ans=await vscode.window.showWarningMessage(strgs.destMapsDel,"Preserve","Remove","No, cancel","Help");
					if(ans==="No, cancel"){
						qpLibCopyChoices.hide();
						return;
					}
					if(ans==="Preserve"){
						prsvDestWCmts=true;
					} else if (ans==="Help") {
						qpLibCopyChoices.hide();
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibsCopySupport);
						return;
					}
				}
				// **ALSO, if all lib paths are taken out warn that entire library will be copied
				if(newChoices.length===0){
					let ans=await vscode.window.showWarningMessage(strgs.cnfrmEntireLib,"Yes","No","Help");
					if(ans==="No"){
						qpLibCopyChoices.hide();
						return;
					} else if (ans==="Help") {
						qpLibCopyChoices.hide();
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibsCopySupport);
						return;
					}
	
				}
				//get the files only lines from cpLines
				//  ** #37, ignore the comment lines which have no src
				const cpLinesPy=cpLines.filter(lne => !lne.inLib && lne.src);
				//now start constructing the new file
				let newFileContents:string="";
				for(const lne of cpLinesPy){
					newFileContents+=lne.src+(lne.dest ? " -> "+lne.dest : "")+"\n";
				}
				//now add the selections from choices, ALL lib - these are either;
				//	- new non-mapped selections
				//	- previously selected mapped that pass through
				//	- ** lines that were commented and are now selected...
				//	-	WHICH can be either mapped or not, if mapped defer to question...
				for(const nc of newChoices){
					if(nc.description && nc.description.endsWith(strgs.pickCommentFlag) && nc.description.includes('->')){
						//??? let below handle????
					} else {
						newFileContents+=nc.label+"\n";
					}
				}
				// **look at cplines having mappings that may be flagged to preserve with comments
				if(prsvDestWCmts){
					const prsvList=cpLines.filter(cpl => cpl.inLib && cpl.dest && !newChoices.some(nc => nc.src===cpl.src));
					if(prsvList){
						//just add cpline back with comment
						// ** need the actual lib folder path
						const libDir=await getLibPath();
						for(const plne of prsvList){
							newFileContents+="# "+libDir+"/"+plne.src+(plne.dest ? " -> "+plne.dest : "")+"\n";
						}
					}
				}
				// ** #37, add back the comment lines EXCEPT the ones matching new choices
				let removingDestMapComment:boolean=false;
				let uncomMappedLines=Array<cpFileLine>(0);
				for(const cmt of cpLinesComments){
					// take off any dest mapping that is in comment, just match src
					const cmtSrcOnly=cmt.origLine?.slice(1).trim().split('->')[0].trim();
					if(!newChoices.some(nc => cmtSrcOnly && nc.label===cmtSrcOnly)){
						newFileContents+=cmt.origLine+'\n';
					} else {
						//if comment is being removed that has dest, flag to ask later
						if(cmt.origLine && cmt.origLine.includes('->')){
							removingDestMapComment=true;
							uncomMappedLines.push(cmt);
						}
					}
				}
				//if removed comment with dest map, ask
				if(removingDestMapComment){
					const ans=await vscode.window.showWarningMessage(strgs.destMapsDel,"Preserve","Remove","No, cancel","Help");
					if(ans==="No, cancel"){
						qpLibCopyChoices.hide();
						return;
					} else if (ans==="Help") {
						qpLibCopyChoices.hide();
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibsCopySupport);
						return;
					}
					if(ans==="Preserve"){
						//just add the orig line without comment back in
						for(const cmt of uncomMappedLines){
							if(cmt.origLine){
								newFileContents+=cmt.origLine.slice(1).trim()+'\n';
							}
						}
					} else {
						//just do the source without the map from orig
						for(const cmt of uncomMappedLines){
							if(cmt.origLine){
								newFileContents+=cmt.origLine.slice(1).trim().split('->')[0].trim()+'\n';
							}
						}
					}
				}
				//write cpfiles, creating if needed and making backup if orig not empty
				const wrslt=await writeCpfiles(newFileContents);
				if(wrslt){
					//give error message
					vscode.window.showErrorMessage(wrslt);
					qpLibCopyChoices.hide();
					return;
				}
				//if all the way to here, just hide
				qpLibCopyChoices.hide();
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
		qpLibCopyChoices.onDidHide(() => {
			qpLibCopyChoices.dispose();
		});
		qpLibCopyChoices.show();
	});
	context.subscriptions.push(cmdMngLibSettings);
	
	//custom object for pick to save src only
	interface fileSelPick extends vscode.QuickPickItem {
		src:string,
		dest:string
	}
	
	const mngCpFilesId:string=strgs.cmdMngFilesPKG;
	//#37, command to manage cpfiles  settings
	const cmdMngFilesSettings=vscode.commands.registerCommand(mngCpFilesId, async () => {
		//if no workspace do nothing but notify
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		// if(!libFilesExist) {
		// 	vscode.window.showInformationMessage(strgs.noLibDir);
		// 	return;
		// }
		//first read the current cpfile
		// ** #37, preserve the comments
		const cpLines=await parseCpfiles(true);
		//then get the current merged list
		let fileListSelects=await getFileListSelect(cpLines);
		//now create a list of quickpicks
		// construct themeicons to use in pick instead of literals
		// **ONLY files???
		const fileIcon:vscode.ThemeIcon=new vscode.ThemeIcon("file");
		const folderIcon:vscode.ThemeIcon=new vscode.ThemeIcon("folder");
		let picks:fileSelPick[]=Array<fileSelPick>(0);
		// ** #37, make list of comments and use to annotate matches and add back in later
		const cpLinesComments=cpLines.filter(lne => lne.origLine && lne.origLine!=='');
		for(const fileSel of fileListSelects) {
			const cpLineMatch=cpLinesComments.find((cmt) => {
				const cmtSrcOnly=cmt.origLine?.slice(1).trim().split('->')[0].trim();
				return (cmtSrcOnly && cmtSrcOnly===fileSel.fullPath);
			});
			let cpLineMatchDest='';
			if(cpLineMatch && cpLineMatch.origLine && cpLineMatch.origLine.includes('->')){
				cpLineMatchDest=cpLineMatch.origLine.slice(1).trim().split('->')[1].trim();
			}
			const pick:fileSelPick={
				label: fileSel.fullPath + (fileSel.dest ? " -> "+fileSel.dest : ""),
				picked:fileSel.selected,
				iconPath:(fileSel.fType===vscode.FileType.File ? fileIcon : folderIcon),
				src:fileSel.src,
				dest:fileSel.dest,
				description: 
					cpLineMatch ? (cpLineMatchDest ? ' -> '+cpLineMatchDest : '') +' $(close) '+strgs.pickCommentFlag : ''
			};
			picks.push(pick);
		}
		// const pickOpt:vscode.QuickPickOptions={
		// 	canPickMany:true,
		// 	placeHolder: strgs.mngFileChecks,
		// 	title: strgs_mngFileChooseFiles
		// };
		const helpButton:cmdQuickInputButton={
			iconPath:iconCommandHelp,
			tooltip:strgs.helpTooltipMap.get(strgs.helpFilesCopySupport),
			commandName:'help'
		};
		// const newChoices=await vscode.window.showQuickPick<fileSelPick>(picks,
		// 	{title:strgs_mngFileChooseFiles, placeHolder:strgs.mngFileChecks, canPickMany:true}
		// );
		const qpFileCopyChoices=vscode.window.createQuickPick<fileSelPick>();
		qpFileCopyChoices.items=picks;
		qpFileCopyChoices.selectedItems=picks.filter(pick => pick.picked);
		qpFileCopyChoices.title=strgs_mngFileChooseFiles;
		qpFileCopyChoices.placeholder=strgs.mngFileChecks;
		qpFileCopyChoices.canSelectMany=true;
		qpFileCopyChoices.buttons=[helpButton];
		qpFileCopyChoices.onDidTriggerButton((button) => {
			const btn=button as cmdQuickInputButton;
			if (btn.commandName === 'help') {
				qpFileCopyChoices.hide();
				// show the help page
				vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
			}
		});
		qpFileCopyChoices.onDidAccept(async () => {
			// get the selected items
			const newChoices=qpFileCopyChoices.selectedItems;
			if(newChoices){
				let prsvDestWCmts:boolean=false;	//if true, use/remove comments to keep destinations
				//the return is only the new picks, all others in cpfiles should be deleted OR commented
				//just format the file again from cpLines and newChoices
				// **BUT, if cplines had dest and it is NOT in choices, give warning and choice to stop **
				if(
					cpLines.some((cpl) => {
						return (!cpl.inLib && cpl.dest && !newChoices.some(nc => nc.src===cpl.src));
					})
				){
					let ans=await vscode.window.showWarningMessage(strgs.destMapsDel,"Preserve","Remove","No, cancel","Help");
					if(ans==="No, cancel"){
						qpFileCopyChoices.hide();
						return;
					} else if (ans==="Help") {
						qpFileCopyChoices.hide();
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
						return;
					}	
					if(ans==="Preserve"){
						prsvDestWCmts=true;
					}
				}
				// **ALSO, if no .py files are selected, warn that only code.py/main.py will be copied
				// ** #123 - skip warning at this point if have some choices and have src or dest py file, 
				//	OR if have comment files with mapping.  Then check again later to see if final map was py
				// ** create a flag to track whether have any .py files, which can be checked later
				// also flag to say warning already given
				let havePyFile:boolean=false;
				let pyWarningGiven:boolean=false;
				havePyFile=newChoices.some(chc => chc.src.endsWith('.py') || (chc.dest && chc.dest.endsWith('.py')));
				if(newChoices.length===0 || 
						!(havePyFile || newChoices.some(chc => chc.description && /->.+comment/i.test(chc.description)))){
					// select the right message
					let noPyFilesMsg=strgs.cnfrmNoPyFiles;	// this applies if no choices and no py files
					if(newChoices.length>0 && !havePyFile){
						noPyFilesMsg=strgs.cnfrmNoPyFilesAtAll;
					}
					let ans=await vscode.window.showWarningMessage(noPyFilesMsg,"Yes","No","Help");
					if(ans==="No"){
						qpFileCopyChoices.hide();
						return;
					} else if (ans==="Help") {
						qpFileCopyChoices.hide();
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
						return;
					}
					pyWarningGiven=true;
				}
				//now start constructing the new file
				let newFileContents:string="";
				// process the selected files first (may include prev commented)
				//now add the selections from choices, ALL files - these are either;
				//	- new non-mapped selections
				//	- previously selected mapped that pass through
				//	- ** lines that were commented and are now selected...
				//	-	WHICH can be either mapped or not, if mapped defer to question...
				for(const nc of newChoices){
					if(nc.description && nc.description.endsWith(strgs.pickCommentFlag) && nc.description.includes('->')){
						//??? let below handle????
					} else {
						newFileContents+=nc.label+"\n";
					}
				}
				//get the lib only lines from cpLines
				//  ** #37, ignore the comment lines which have no src
				const cpLinesLib=cpLines.filter(lne => lne.inLib && lne.src);
				if(cpLinesLib){
					// ** need the actual lib folder path
					const libDir=await getLibPath();
					for(const lne of cpLinesLib){
						newFileContents+=libDir+"/"+lne.src+(lne.dest ? " -> "+lne.dest : "")+"\n";
					}
				}
				// **look at cplines having mappings that may be flagged to preserve with comments
				if(prsvDestWCmts){
					const prsvList=cpLines.filter(cpl => !cpl.inLib && cpl.dest && !newChoices.some(nc => nc.src===cpl.src));
					if(prsvList){
						//just add cpline back with comment
						for(const plne of prsvList){
							newFileContents+="# "+plne.src+(plne.dest ? " -> "+plne.dest : "")+"\n";
						}
					}
				}
				// ** #37, add back the comment lines EXCEPT the ones matching new choices
				let removingDestMapComment:boolean=false;
				let uncomMappedLines=Array<cpFileLine>(0);
				for(const cmt of cpLinesComments){
					// take off any dest mapping that is in comment, just match src
					const cmtSrcOnly=cmt.origLine?.slice(1).trim().split('->')[0].trim();
					if(!newChoices.some(nc => cmtSrcOnly && nc.label===cmtSrcOnly)){
						newFileContents+=cmt.origLine+'\n';
					} else {
						//if comment is being removed that has dest, flag to ask later
						if(cmt.origLine && cmt.origLine.includes('->')){
							removingDestMapComment=true;
							uncomMappedLines.push(cmt);
						}
					}
				}
				//if removed comment with dest map, ask
				if(removingDestMapComment){
					const ans=await vscode.window.showWarningMessage(strgs.destMapsDel,"Preserve","Remove","No, cancel","Help");
					if(ans==="No, cancel"){
						qpFileCopyChoices.hide();
						return;
					} else if (ans==="Help") {
						qpFileCopyChoices.hide();
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
						return;
					}
					// ** #123 - check to see result of uncommented lines has py file, just check end of line  for .py
					if(ans==="Preserve"){
						//just add the orig line without comment back in
						for(const cmt of uncomMappedLines){
							if(cmt.origLine){
								const _newCpline=cmt.origLine.slice(1).trim();
								if(_newCpline.endsWith('.py')){
									havePyFile=true;
								}
								newFileContents+=_newCpline+'\n';
							}
						}
					} else {
						//just do the source without the map from orig
						for(const cmt of uncomMappedLines){
							if(cmt.origLine){
								const _newCpline=cmt.origLine.slice(1).trim().split('->')[0].trim();
								if(_newCpline.endsWith('.py')){
									havePyFile=true;
								}
								newFileContents+=_newCpline+'\n';
							}
						}
					}
				}
				// ** #123 - if no py files in newFileContents, give warning and option to cancel before save
				if(!havePyFile && !pyWarningGiven){
					// if no py file but at least one choice, must be non-py so use different message
					let noPyFilesMsg=strgs.cnfrmNoPyFiles;	// this applies if no choices and no py files
					if(newChoices.length>0){
						noPyFilesMsg=strgs.cnfrmNoPyFilesAtAll;
					}
					let ans=await vscode.window.showWarningMessage(noPyFilesMsg,"Yes","No","Help");
					if(ans==="No"){
						qpFileCopyChoices.hide();
						return;
					} else if (ans==="Help") {
						qpFileCopyChoices.hide();
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
						return;
					}	
				}
				//write cpfiles, creating if needed and making backup if orig not empty
				const wrslt=await writeCpfiles(newFileContents);
				if(wrslt){
					//give error message
					vscode.window.showErrorMessage(wrslt);
					qpFileCopyChoices.hide();
					return;
				}
				//if all the way to here, just hide
				qpFileCopyChoices.hide();
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
		qpFileCopyChoices.onDidHide(() => {
			qpFileCopyChoices.dispose();
		});
		qpFileCopyChoices.show();
	});
	context.subscriptions.push(cmdMngFilesSettings);


	// ** query attached drives for the initial cache
	await refreshDrives();

	//get the initial drive setting, save for button setup
	//NOTE that if no workspace this will be empty string, so OK
	curDriveSetting=getCurrentDriveConfig();
	//????? save in ext state?
	//context.subscriptions.push(curDriveSetting);

	// ** #118, wire up the file decorator - initial set will be empty, will refresh below
	const fileDec=new FileDecorator(context);

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
			// #101, need to add defaults because there may be libs (and cpFileLines always has array)
			const cpFileLinesDfltPy=[
				{
					src:'code.py', dest:'',	inLib:false
				},
				{
					src: 'main.py',	dest: '', inLib: false
				}
			];
			cpFileLines=[...cpFileLines,...cpFileLinesDfltPy];
		}
		// ** #118, set the initial file decorators
		await updateFileDecorations(cpFileLines);
		//
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
	statusBarItem1= vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,55);
	statusBarItem1.command=button1Id;
	statusBarItem2=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,54);
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

	// ** will need to construct both lib and stub mgmt classes,
	//	but the ask if want to init them based on whether archive folders are there
	// ** spin up the library management, calling the constructor
	// ** #68, need these to be global
	libMgmtSys=new LibraryMgmt(context);
	// ** and then the stub management, calling the constructor
	stubMgmtSys=new StubMgmt(context);

	if(haveCurrentWorkspace){
		// ** if archives are not there, ask if want to init
		if (!stubMgmtSys.stubsArchiveExists() || !libMgmtSys.libArchiveExists() ) {
			// ** #68, if not only no arch folders but also missing lib and py files, just bail
			if(libraryFolderExists || pyFilesExist){
				const ans=await vscode.window.showInformationMessage(strgs.extActivateAskLibStubs,{modal:true, detail:strgs.extActivateAskLibStubsDetail},'Yes','No','Help');
				if(ans==='Yes'){
					try {
						await libMgmtSys.setupLibSources();
					} catch (error) {
						//report the error but continue
						vscode.window.showErrorMessage(strgs.setupLibGeneralError+getErrorMessage(error));
						libMgmtSys.stopLibUpdateProgress();
					}
					try {
						await stubMgmtSys.installStubs();
					} catch (error) {
						//report the error but continue
						vscode.window.showErrorMessage(strgs.installStubsGeneralError+getErrorMessage(error));
						stubMgmtSys.stopStubUpdateProgress();
						
					}
				} else if(ans==='Help'){
					// still need to init the lib and cp tags
					libMgmtSys.setLibCPtagVers();
					// show the help page for libraries
					vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibrarySupport);
				} else {
					// still need to init the lib and cp tags
					libMgmtSys.setLibCPtagVers();
				}
			}
		} else {
			try {
				await libMgmtSys.setupLibSources();
			} catch (error) {
				//report the error but continue
				vscode.window.showErrorMessage(strgs.setupLibGeneralError+getErrorMessage(error));
				libMgmtSys.stopLibUpdateProgress();
			}
			try {
				await stubMgmtSys.installStubs();
			} catch (error) {
				//report the error but continue
				vscode.window.showErrorMessage(strgs.installStubsGeneralError+getErrorMessage(error));
				stubMgmtSys.stopStubUpdateProgress();
			}
		}
	}
	// ** #60, construct the package bundle management class
	const projBundleMgmtSys=new ProjectBundleMgmt(context);
	if(haveCurrentWorkspace){
		// other init
	}

	// ** #126, spin up the uf2 load class but nothing happens until command
	const uf2Loader = new UploadUf2(context);
	if(haveCurrentWorkspace){
		//other init??
	}

	/*
	// now call the setup if have workspace
	if(haveCurrentWorkspace){
		await libMgmtSys.setupLibSources();	//wait???
	}

	// now call the setup if have workspace
	if(haveCurrentWorkspace){
		stubMgmtSys.installStubs();	//don't need to wait
	}
	*/
	
	// ** Issue #10 - see if a usb drive with boot file exists, if so, offer to connect but only if not current **
	//	have the current mapping and the last drive list
	// find the first usb drive in last drives, if any
	//BUT can't do anything if no workspace
	if(haveCurrentWorkspace) {
		const connectCandidate=lastDrives.find((drv:drvlstDrive,index,ary) => {
			return drv.isRemovable;		// no longer using drv.isUsb;
		});
		//if got a candidate, check it...
		let connectDrvPath:string='';
		if(connectCandidate) {
			if(connectCandidate.drvPath.toLowerCase().includes('circuitpy') || connectCandidate.volumeLabel?.toLowerCase()==='circuitpy') {
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
					// ** #111, check if cur drive is set, if so ask if want to change
					let chgDriveMessage:string=strgs.fndCPDrvInsPath[0]+connectDrvPath+strgs.fndCPDrvInsPath[1];
					if(curDriveSetting!==''){
						chgDriveMessage=strgs.fndCPDrvInsPathChange[0]+connectDrvPath+strgs.fndCPDrvInsPathChange[1]+curDriveSetting+strgs.fndCPDrvInsPathChange[2];
					}
					const pickRes=await vscode.window.showInformationMessage(chgDriveMessage,
						{modal:true,detail:strgs.fndCPDrvInsPathDetail},'Yes','No');
					if(pickRes==='Yes') {
						vscode.workspace.getConfiguration().update(`circuitpythonsync.${strgs.confDrivepathPKG}`,connectDrvPath);
						curDriveSetting=connectDrvPath;
						updateStatusBarItems();
					}
				}
			}
		}
	}

	// ** attach the board file view
	const bfe=new BoardFileExplorer(context,curDriveSetting);

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

	async function getBootFileContents(curDriveSetting:string): Promise<string> {
		let retval:string='';
		let foundBootFile:string='';
		const _curDrive=curDriveSetting;
		if(_curDrive){
			let baseUri=_curDrive;	
			if (os.platform()==='win32') {
				baseUri='file:'+baseUri;
			}
			const boardUri:vscode.Uri=vscode.Uri.parse(baseUri);
			const dirContents=await vscode.workspace.fs.readDirectory(boardUri);
			let foundBootFile=dirContents.find((value:[string,vscode.FileType],index,ary) => {
				if(value.length>0){
					return value[0]===strgs_cpBootFile;
				} else {
					return false;
				}
			});
			if(foundBootFile){
				//get the contents of the boot_out.txt file
				const bootFileUri:vscode.Uri=vscode.Uri.joinPath(boardUri,strgs_cpBootFile);
				const bootFileContents=await vscode.workspace.fs.readFile(bootFileUri);
				const constBootContent=fromBinaryArray(bootFileContents);
				retval=constBootContent;
			}
		}
		return retval;
	}


	const openDirId:string=strgs.cmdSetDirPKG;
	//command to get drive using open file dialog -- NOW it tries to find CP drive first
	const fileCmd=vscode.commands.registerCommand(openDirId, async () => {
		// ** if no workspace this command does nothing but give warning **
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		// **#72, adding help
		const helpButton:cmdQuickInputButton={
			iconPath:iconCommandHelp,
			tooltip:strgs.helpTooltipMap.get(strgs.helpDriveMapping),
			commandName:'help'
		};
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
					// ** OR if label is circuitpy
					if(drvPath.toLowerCase().includes('circuitpy') || drv.volumeLabel?.toLowerCase().includes('circuitpy')) {
						detectedPath= drvPath;	// not using usb any more drv.isUSB ? drvPath : '';
						detectedPathNotUsb='';	// !drv.isUSB ? drvPath : '';
					} else if(drv.isRemovable) {
						// call this one ok too but not usb
						detectedPath= drv.isUSB ? drvPath : '';
						detectedPathNotUsb= !drv.isUSB ? drvPath : '';
					}else {
						//not detected yet, see if boot_out.txt at path
						//need to add file scheme in windows
						let baseUri=drvPath;
						if (os.platform()==='win32') {
							baseUri='file:'+baseUri;
						}
						//**replace glob find files with dir read for performance
						// ** need to detect error here in case of permissions issues
						let foundBootFile:[string,vscode.FileType]|undefined=undefined;
						try {
							const dirContents=await vscode.workspace.fs.readDirectory(vscode.Uri.parse(baseUri));
							foundBootFile=dirContents.find((value:[string,vscode.FileType],index,ary) => {
								if(value.length>0){
									return value[0]===strgs_cpBootFile;
								} else {
									return false;
								}
							});
						} catch (error) {
							console.log(strgs.errListingDrvBadBootPath, drvPath);
							continue;
						}
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
			console.error(strgs.errListingDrv, error );
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
		// ** #72, use full quick pick so can have button for help
		let result:drivePick|undefined=undefined;
		const resultWbutton=await showFullQuickPick(
			{
				items:picks,
				title:strgs.cpDrvSel,
				placeholder:strgs.pickDrvOrManual,
				buttons:[helpButton],
				shouldResume: shouldResume
			}
		);
		// const result=await vscode.window.showQuickPick<drivePick>(picks,{
		// 	placeHolder:strgs.pickDrvOrManual,
		// 	title: strgs.cpDrvSel
		// });
		if(resultWbutton && isCmdQuickInputButton(resultWbutton)){ 
			if(resultWbutton.commandName==='help'){
				// ** #72, open the help page
				vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpDriveMapping);
				return;	
			}
		}
		if(resultWbutton && !isCmdQuickInputButton(resultWbutton)){
			result=resultWbutton as drivePick;
		} else {
			result=undefined;	//get out of this loop
		}
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
			// ** #36 go ahead and refresh view in case board was reconnected
			bfe.boardFileProvider.refresh(curDriveSetting);
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
		// #73, also update board map button on status bar
		statusBarMapDrv.tooltip=curDriveSetting ? new vscode.MarkdownString(`CP Drive- ${curDriveSetting}`) : strgs.cpDrvSel;
		//
		//bfe.boardFileProvider=new BoardFileProvider(curDriveSetting);
		bfe.boardFileProvider.refresh(curDriveSetting);
		// ** #73, if no board chosen ask if want to select one
		// ** #82 get contents of boot file to show
		const curBoardSelection = vscode.workspace.getConfiguration().get(`circuitpythonsync.${strgs.confBoardNamePKG}`,'');
		if(!curBoardSelection){
			const bootContents=await getBootFileContents(curDriveSetting);
			let bootFileBoard:string='';
			if(bootContents && bootContents.length>0){
				const re=/board\sid:(.+)[\n\r]+/i;
				const match=bootContents.match(re);
				if(match && match.length>1){
					bootFileBoard=match[1].trim();
				}
			}
			let ans:string|undefined='No';
			if(bootFileBoard && bootFileBoard.length>0) {
				ans=await vscode.window.showInformationMessage(strgs.pickDrvAskSelBoard + ` (boot_file shows ${bootFileBoard})`, 'Yes, this one',"Yes, but I'll pick",'No, cancel','Help');
			} else {
				ans=await vscode.window.showInformationMessage(strgs.pickDrvAskSelBoard, 'Yes','No, cancel','Help');
			}
			if(ans && ans.startsWith('Yes')){
				// call the select board command, passing bootFileBoard if set
				if(bootFileBoard && bootFileBoard.length>0 && ans==='Yes, this one') {
					vscode.commands.executeCommand(strgs.cmdSelectBoardPKG,bootFileBoard);
				} else {
					vscode.commands.executeCommand(strgs.cmdSelectBoardPKG);
				}
			} else if(ans==='Help'){
				// show the help page
				vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpBoardSupport);
			}
		}
		
	});
	context.subscriptions.push(fileCmd);

	// ** #73, create status bar button to map drive, tooltip linked to command
	statusBarMapDrv=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,53);
	statusBarMapDrv.text='CP$(plug)';
	statusBarMapDrv.command=openDirId;
	statusBarMapDrv.tooltip=curDriveSetting ? new vscode.MarkdownString(`CP Drive- ${curDriveSetting}`) : strgs.cpDrvSel;
	if(haveCurrentWorkspace){
		statusBarMapDrv.show();
	} else {
		statusBarMapDrv.hide();
	}
	context.subscriptions.push(statusBarMapDrv);

	// ** set defaults for remembered download settings
	// ** #34, by default only copy "standard" project folders
	confirmDnldOverwrite=true;
	confirmDnldSkipDots=true;
	confirmDnldStdFoldersOnly=true;
	
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
			vscode.window.showInformationMessage(strgs.mustSetDrvDnld);
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
		// #34 also non-standard folder skip
		let skipDotFiles=confirmDnldSkipDots;
		let allowOverwrite=confirmDnldOverwrite;
		let onlyStdFolders=confirmDnldStdFoldersOnly;

		const dnldConfigPicks:vscode.QuickPickItem[]=[
			{
				label: strgs.pickAllowOverwrite,
				picked: allowOverwrite				
			},
			{
				label: strgs.pickSkipDots,
				picked: skipDotFiles
			},
			{
				label: strgs.pickStdFoldersOnly,
				picked: onlyStdFolders
			}
		];
		// ** #72, adding help
		const helpButton:cmdQuickInputButton={
			iconPath:iconCommandHelp,
			tooltip:strgs.helpTooltipMap.get(strgs.helpDownloading),
			commandName:'help'
		};
		const qpBoardDnldChoices=vscode.window.createQuickPick();
		qpBoardDnldChoices.items=dnldConfigPicks;
		qpBoardDnldChoices.title=strgs.dnldCfgQpTitle;
		qpBoardDnldChoices.placeholder=strgs.dnldCfgQpPlchld;
		qpBoardDnldChoices.buttons=[helpButton];
		qpBoardDnldChoices.canSelectMany=true;
		qpBoardDnldChoices.selectedItems=dnldConfigPicks.filter(item => item.picked);
		// const choices=await vscode.window.showQuickPick(dnldConfigPicks,
		// 	{title: strgs.dnldCfgQpTitle,placeHolder: strgs.dnldCfgQpPlchld, canPickMany:true}
		// );
		qpBoardDnldChoices.onDidTriggerButton((button) => {  
			const btn=button as cmdQuickInputButton;
			if (btn.commandName === 'help') {
				qpBoardDnldChoices.hide();
				// show the help page
				vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpDownloading);
			}
		}); 	
		qpBoardDnldChoices.onDidAccept(async () => {
			const choices=qpBoardDnldChoices.selectedItems;
			// ** if no choice that is cancel, get out
			if(!choices){
				qpBoardDnldChoices.hide();	
				return;
			}
			// process choices, updating tracking too, NOTE that uncheck is not returned, so is false
			// AND picked prop is not set, so just pick showing in result means selected
			// SO set all settings to false, let loop set true
			allowOverwrite=false;
			skipDotFiles=false;
			onlyStdFolders=false;
			for(const choice of choices){
				if(choice.label===strgs.pickAllowOverwrite) { 
					allowOverwrite=true;
				}
				if(choice.label===strgs.pickSkipDots){
					skipDotFiles=true;
				}
				if(choice.label===strgs.pickStdFoldersOnly){
					onlyStdFolders=true;
				}
			}
			confirmDnldOverwrite=allowOverwrite;
			confirmDnldSkipDots=skipDotFiles;
			confirmDnldStdFoldersOnly=onlyStdFolders;
			//now ready to download to workspace (have to check to resolve transpiler)
			const wsRootFolderUri=vscode.workspace.workspaceFolders?.[0].uri;
			if(!wsRootFolderUri) {return;}	//should never
			//####FIXED#### the cpProjTemplate should be only the default!!
			for(const dirEntry of dirContents){
				if((!skipDotFiles || !dirEntry[0].startsWith('.')) 
						&& (!onlyStdFolders || !(dirEntry[1]===vscode.FileType.Directory && !cpProjTemplateDefault.some(tmpl => tmpl.folderName===dirEntry[0])))) {
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
							qpBoardDnldChoices.hide();
							return;
						}
					}
				}
			}
			qpBoardDnldChoices.hide();
		});
		qpBoardDnldChoices.onDidHide(() => {
			qpBoardDnldChoices.dispose();
		});
		qpBoardDnldChoices.show();
	});
	context.subscriptions.push(dndBoardCmd);

	// **command to scaffold new project **
	const makeNewProjectId=strgs.cmdScaffoldProjectPKG;
	// ** #88, provide a "no don't ask again" option on board download
	let noAskDnldAgain:boolean=false;
	const makeProjCmd=vscode.commands.registerCommand(makeNewProjectId, async (forceChoice:string) =>{
		//if no workspace do nothing but notify
		if(!haveCurrentWorkspace) {
			vscode.window.showInformationMessage(strgs.mustHaveWkspce);
			return;
		}
		// **#72, adding help
		const helpButton:cmdQuickInputButton={
			iconPath:iconCommandHelp,
			tooltip:strgs.helpTooltipMap.get(strgs.helpProjectTemplateSupport),
			commandName:'help'
		};
		// ** DON'T need drive mapping yet...BUT if do, warn that downloading is better...
		// BUT if re-entered with forceChoice skip this...
		// #88, also don't if no ask again set
		if(curDriveSetting!=='' && (forceChoice===undefined || forceChoice==='')  && !noAskDnldAgain) { 
			const ans=await vscode.window.showInformationMessage(strgs.projTemplateAskDnld,'Yes',"No,don't ask again",'No','Help');
			if(ans==='Yes'){
				// #88, set don't ask again since responded.
				noAskDnldAgain=true;
				vscode.commands.executeCommand(dnldCpBoardId);
				return;
			} else if (ans==="No,don't ask again"){
				noAskDnldAgain=true;
			} else if(ans==='Help'){
				// show the help page
				vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpDownloading);
				return;
			}	
		}
		// ** #57, allow for "looping" back to main QP if pick alternate template
		let readyForTemplateProc:boolean=false;
		let picks:vscode.QuickPickItem[]=[
			{
				label: strgs.projTemplateQPSepTop,
				kind: vscode.QuickPickItemKind.Separator
			},
			{
				label: strgs.projTemplateQPItemAll,
				picked: false
			},
			{
				label: strgs.projTemplateQpItemMerge,
				picked: false
			},
			{
				label: strgs.projTemplateQPItemSamples,
				picked: false
			}
		];
		// determine if there are personal template paths, if so can provision a pick to go choose
		//  ** always show option, just may not have links **
		const cpsyncSettings=vscode.workspace.getConfiguration('circuitpythonsync');
		const projTemplatePaths:string[]=cpsyncSettings.get(strgs.confCPTemplatePathListPKG,[]);
		let pickTemplates:vscode.QuickPickItem[]=[];
		picks.push(
			{
				label:strgs.projTemplateQPItemPickSep,
				kind:vscode.QuickPickItemKind.Separator
			},
			{
				label:strgs.projTemplateQPItemAddNew
			},
			{
				label: strgs.projTemplateQPItemView
			}
		);
		if(projTemplatePaths && projTemplatePaths.length>0) {
			// ** add the paths to the pick list
			// ** #85, add description to each pick that shows start and end of string so can tell better the template
			pickTemplates=projTemplatePaths.map((path:string) => {
				return {
					label: path,
					detail: path.length > 45 ?
						`      ${path.substring(0, 15)}...${path.substring(path.length - 30)}` : // show start and end of string
						`      ${path}` // if path is short enough just show it all
				};
			});
		} else {
			// might have deleted list after load, so set back to default
			projTemplatePath='';
			await cpsyncSettings.update(strgs.confCPTemplatePathPKG,projTemplatePath, vscode.ConfigurationTarget.Global);
			const fullTemplPathUri=vscode.Uri.joinPath(context.extensionUri,'resources/cptemplate.txt');
			//vscode.window.showInformationMessage("cp proj template path: "+fullTemplPathUri.fsPath);
			try{
				const templateContentBytes=await vscode.workspace.fs.readFile(fullTemplPathUri);
				templateContent=fromBinaryArray(templateContentBytes);
			} catch {
				console.log(strgs.projTemplateNoLoad);
				vscode.window.showErrorMessage(strgs.projTemplateNoLoad);
				return;
			}
			if(templateContent){
				cpProjTemplate = parseCpProjTemplate(templateContent);
			}
		}
		// put a separator before the next two picks
		pickTemplates.unshift({
			label: strgs.projTemplateAddMngQPitemDflt
		});
		pickTemplates.unshift({
			label: strgs.projTemplateAddMngQPBotSep,
			kind: vscode.QuickPickItemKind.Separator
		});
		// add command to add new templates at top
		pickTemplates.unshift({
			label: strgs.projTemplateAddMngQPitemAdd
		});
		// now put a default at the top of the list
		pickTemplates.unshift({
			label: strgs.projTemplateAddMngQPTopSep,
			kind: vscode.QuickPickItemKind.Separator
		});
		let addSampleFiles:boolean=false;
		let mergeSettings:boolean=false;
		// ** #60, add a hidden choice to add files and merge settings only. No overwrite and no samples
		let addNewMergeSettingsOnly:boolean=false;	// string will be "addNewMergeSettingsOnly"
		// #88 - add view template raw
		let viewTemplateRaw:boolean=false;
		//check to see if this command called with a forced choice
		let choices:vscode.QuickPickItem | undefined=undefined;
		if(forceChoice!==undefined && forceChoice!=='') {
			choices={label: forceChoice};	//force the choice to be set
		}
		// ####TEST#### see if vscode instance avail
		//if(!vscode.workspace.workspaceFolders) {return;}
		// ####TEST#####
		while(!readyForTemplateProc){
			if(!choices) {
				// ** #72, use full quick pick so can have button for help
				const choicesWbutton=await showFullQuickPick(
					{
						title: strgs.projTemplateQPTitle,
						placeholder: strgs.projTemplateQPPlaceholder+(projTemplatePath ? `(from ${projTemplatePath})`: '(from default)'),
						buttons:[helpButton],
						items:picks,
						shouldResume: shouldResume		//shouldResume
					}
				);
				// choices=await vscode.window.showQuickPick(picks,
				// 	{title: strgs.projTemplateQPTitle,placeHolder: strgs.projTemplateQPPlaceholder+(projTemplatePath ? `(from ${projTemplatePath})`: '(from default)'),
				// 	canPickMany:false}
				// );
				if(choicesWbutton && isCmdQuickInputButton(choicesWbutton)){ 
					if(choicesWbutton.commandName==='help'){
						// ** #72, open the help page
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpProjectTemplateSupport);
						choices=undefined;	//get out of this loop
						return;
					}
				}
				if(choicesWbutton && !isCmdQuickInputButton(choicesWbutton)){
					choices=choicesWbutton as vscode.QuickPickItem;
				} else {
					choices=undefined;	//get out of this loop
				}
			}
			// ** if no choice that is cancel, get out
			if(!choices){return;}
			addSampleFiles=choices.label===strgs.projTemplateQPItemSamples;		//choices.some(choice => choice.label===strgs.projTemplateQPItemSamples);
			mergeSettings=choices.label===strgs.projTemplateQpItemMerge;		//choices.some(choice => choice.label===strgs.projTemplateQpItemMerge);
			addNewMergeSettingsOnly=choices.label===strgs.projTemplateQPItemHiddenAddNewWSettings;
			viewTemplateRaw=choices.label===strgs.projTemplateQPItemView;
			const pickNewTemplate:boolean=choices.label===strgs.projTemplateQPItemAddNew;
			if(pickNewTemplate) {
				// ** #57, get the template path from the user
				const newTemplate=await vscode.window.showQuickPick(pickTemplates,{
					title: strgs.projTemplateAddMngQPTitle,
					placeHolder: strgs.projTemplateAddMngQPTPlchldr
				});
				if(!newTemplate) {
					choices=undefined;	//get out of this loop
					continue;
				}	//if no pick just bring main qp back up
				// ** set the new template path in the config, get method will use it
				let newTemplatePath:string=newTemplate.label;
				// check to see if want to go to add new template path/link, flag command to return to make project
				if(newTemplate.label===strgs.projTemplateAddMngQPitemAdd){
					vscode.commands.executeCommand(strgs.cmdAddTemplateLinkPKG,true);
					return;   // get out of this command, flag will return to make project
				}
				if(newTemplate.label===strgs.projTemplateAddMngQPitemDflt) {
					// ** reset to default
					newTemplatePath='';
				}
				await cpsyncSettings.update(strgs.confCPTemplatePathPKG,newTemplatePath, vscode.ConfigurationTarget.Global);
				// ** now re-read the template into the project array
				let templateContent:string='';
				// ** #57, get the override project template text from file or URL in setting
				const projTemplateText=await getProjTemplateText();
				if(projTemplateText){
					templateContent=projTemplateText;
				} else {
					//const fullTemplPath=context.asAbsolutePath(path.join('resources','cptemplate.txt'));
					const fullTemplPathUri=vscode.Uri.joinPath(context.extensionUri,'resources/cptemplate.txt');
					//vscode.window.showInformationMessage("cp proj template path: "+fullTemplPathUri.fsPath);
					try{
						const templateContentBytes=await vscode.workspace.fs.readFile(fullTemplPathUri);
						templateContent=fromBinaryArray(templateContentBytes);
					} catch {
						console.log(strgs.projTemplateNoLoad);
						vscode.window.showErrorMessage(strgs.projTemplateNoLoad);
						return;
					}
				}
				if(templateContent){
					cpProjTemplate = parseCpProjTemplate(templateContent);
				}
				// and loop back to see what action is needed
				// clear choices since it may have been forced
				choices=undefined;
			} else if(viewTemplateRaw) {
				// ** #88, show the raw template text
				let docTitle='CurrentTemplate';
				if(projTemplatePath){
					/*
					if(projTemplatePath.includes('/')){
						docTitle=projTemplatePath.substring(projTemplatePath.lastIndexOf('/')+1);
					} else if (projTemplatePath.includes('\\')){
						docTitle=projTemplatePath.substring(projTemplatePath.lastIndexOf('\\')+1);
					}
					*/
					docTitle=projTemplatePath;
				} else {
					docTitle=strgs.projTemplateViewTemplateDfltTitle;
				}
				const vturi=vscode.Uri.parse(vtScheme+':'+docTitle);
				const vtdoc=await vscode.workspace.openTextDocument(vturi);
				await vscode.window.showTextDocument(vtdoc,{preview:false});
				choices=undefined;
				return;		//get out of command so can see template
			} else {
				// ** set the flag to true to proceed
				readyForTemplateProc=true;
			}
		}
		//read the workspace and determine if any files exist other than the .vscode folder, ask
		const wsRootFolderUri=vscode.workspace.workspaceFolders?.[0].uri;
		if(!wsRootFolderUri) {return;}	//should never
		const wsContents=await vscode.workspace.fs.readDirectory(wsRootFolderUri);
		// ** allow for settings.json merge and lib/stub archive directories to be present, will never template those
		if(wsContents.some(entry => entry[0]!=='.vscode' 
			&& entry[0]!==strgs.workspaceLibArchiveFolder && entry[0]!==strgs.stubArchiveFolderName 
			&& !mergeSettings && !addSampleFiles && !addNewMergeSettingsOnly &&
			// #81, check if none of the template files are present, if so don't ask
			(cpProjTemplate.some(tmpl => (tmpl.folderName===entry[0] && entry[1]===vscode.FileType.Directory) || (tmpl.fileName===entry[0] && entry[1]===vscode.FileType.File))))) {
				const ans=await vscode.window.showWarningMessage(strgs.projTemplateConfOverwrite,'Yes','No, cancel');
				if(ans==='No, cancel'){return;}
		}
		//now go thru template either making directory or writing file
		let fpathUri:vscode.Uri;
		let bFContent:Uint8Array;
		//####TBD#### use the default template if AddNewMergeSEttingsOnly forced
		let cpProjTemplateCur=cpProjTemplate.slice();
		if(addNewMergeSettingsOnly) {
			cpProjTemplateCur=cpProjTemplateDefault.slice();
		}
		for(const tEntry of cpProjTemplateCur){
			if(tEntry.folderName!=='/' && tEntry.folderName!=='' && tEntry.fileName==='') {
				//this is just a folder, make it even if it exists??????
				// ** if mergeSettings skip folder only, but anything else allow it
				if(mergeSettings) {continue;}
				fpathUri=vscode.Uri.joinPath(wsRootFolderUri,tEntry.folderName);
				try{
					await vscode.workspace.fs.createDirectory(fpathUri);
				} catch(error) {
					const fse:vscode.FileSystemError=error as vscode.FileSystemError;
					vscode.window.showErrorMessage(strgs.projTemplateErrWriteFolder+fse.message);
				}
			} else {
				//have file and possibly folder, set a composite path if folder, else just root
				//  ** use the file names from the template, set .sample later
				fpathUri=wsRootFolderUri;
				if(tEntry.folderName!=='/' && tEntry.folderName!==''){
					fpathUri=vscode.Uri.joinPath(wsRootFolderUri,tEntry.folderName);
				}
				//now add the filename, will be one 
				fpathUri=vscode.Uri.joinPath(fpathUri,tEntry.fileName);
			}
			//write the file in the calc path if filename
			if(tEntry.fileName!==''){	
				// ** if file is settings.json in .vscode will need to do a merge not overwrite
				if(tEntry.fileName!=='settings.json' || tEntry.folderName!=='.vscode'
					|| !existsSync(fpathUri.fsPath)) {
					// now process files:
					//	if settings.json and mergeSettings, can just let write; sample doesn't apply
					//	if mergeSettings and not settings.json, skip any other files
					//	if not merge but addsample, just write with .sample extension if file exists
					//	if not merge and not sample, write as is
					// NEW #60, if addNewMergeSettingsOnly, only merge settings.json and add new files, no samples, no overwrite 
					let isSettings:boolean=(tEntry.fileName==='settings.json' && tEntry.folderName==='.vscode');
					if(mergeSettings && !isSettings) {continue;}
					if(!mergeSettings && addSampleFiles && !isSettings && existsSync(fpathUri.fsPath)) {
						// ** add .sample to filename
						fpathUri=fpathUri.with({path:fpathUri.path+'.sample'});
					}
					// for addNewMergeSettingsOnly, let only settings.json and non-existing files through
					if(addNewMergeSettingsOnly && !(isSettings || !existsSync(fpathUri.fsPath))) {continue;}
					//now write the file
					bFContent=toBinaryArray(tEntry.fileContent);
					try{
						await vscode.workspace.fs.writeFile(fpathUri,bFContent);
					} catch(error) {
						const fse:vscode.FileSystemError=error as vscode.FileSystemError;
						vscode.window.showErrorMessage(strgs.projTemplateErrWriteFile+fse.message);
					}
				} else {
					// ** need to read the existing settings.json IF THERE and merge
					// first read the existing settings.json
					let existContent:Uint8Array;
					try{
						existContent=await vscode.workspace.fs.readFile(fpathUri);
					} catch(error) {
						const fse:vscode.FileSystemError=error as vscode.FileSystemError;
						vscode.window.showErrorMessage(strgs.projTemplateErrReadSettings+fse.message);
						return;
					}
					//now merge the two, first parse the existing
					let existObj;
					try{
						existObj=JSON.parse(new TextDecoder().decode(existContent));
					} catch(error) {
						vscode.window.showErrorMessage(strgs.projTemplateErrParseSettings);
						return;
					}
					//now parse the new
					let newObj;
					try{
						newObj=JSON.parse(tEntry.fileContent);
					} catch(error) {
						vscode.window.showErrorMessage(strgs.projTemplateErrParseTemplateSettings);
						return;
					}
					//now merge, new overwrites existing
					// ** #70, allow deep merge of settings.json with array concatenation
					const mergedObj=deepMerge(existObj,newObj);
					//const mergedObj={...existObj,...newObj};
					//now write back
					bFContent=toBinaryArray(JSON.stringify(mergedObj,null,2));
					try{
						await vscode.workspace.fs.writeFile(fpathUri,bFContent);
					} catch(error) {
						const fse:vscode.FileSystemError=error as vscode.FileSystemError;
						vscode.window.showErrorMessage(strgs.projTemplateErrWriteFile+fse.message);
					}
				}
			}
		}
		//###TBD### ask if want to init libraries and stubs?
		if(libMgmtSys && stubMgmtSys &&
			(!stubMgmtSys.stubsArchiveExists() || !libMgmtSys.libArchiveExists() ) ){
			const ans=await vscode.window.showInformationMessage(strgs.projTemplateAskLibStub,'Yes','No','Help');
			if(ans==='Yes'){
				try {
					await libMgmtSys.setupLibSources();
				} catch (error) {
					//report the error but continue
					vscode.window.showErrorMessage(strgs.setupLibGeneralError+getErrorMessage(error));				
				}
				try {
					await stubMgmtSys.installStubs();
				} catch (error) {
					//report the error but continue
					vscode.window.showErrorMessage(strgs.installStubsGeneralError+getErrorMessage(error));				
				}
			} else if(ans==='Help'){
				// show the help page
				vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibrarySupport);
			}
		}
	});
	context.subscriptions.push(makeProjCmd);

	// ** #70, allow deep merge of settings.json with array concatenation
	function deepMerge<T extends object>(target: T, source: T): T {
		for (const key in source) {
			//console.log(key);
			if (source[key] instanceof Object && key in target) {
				if(source[key] instanceof Array && target[key] instanceof Array){
					const _src = [...source[key], ...target[key]] as T[Extract<keyof T, string>];
					source[key] = [...new Set(_src as unknown[])] as T[Extract<keyof T, string>];
				} else {
					if (typeof source[key] === 'object' && typeof target[key] === 'object' && source[key] !== null && target[key] !== null) {
						Object.assign(source[key], deepMerge(target[key], source[key]));
					}
				}
			}
		}
		return Object.assign(target || {}, source);
	}
	

	// ** #57, command to add new links for templates **
	const cmdAddNewTemplateLinkId:string=strgs.cmdAddTemplateLinkPKG;
	const addNewTemplateLinkCmd=vscode.commands.registerCommand(cmdAddNewTemplateLinkId, async (fromMakeProject:boolean) => {
		//if no workspace do nothing but notify
		// if(!haveCurrentWorkspace) {
		// 	vscode.window.showInformationMessage(strgs.mustHaveWkspce);
		// 	return;
		// }
		// loop getting new entries until cancel or done
		// **#72, adding help
		const helpButton:cmdQuickInputButton={
			iconPath:iconCommandHelp,
			tooltip:strgs.helpTooltipMap.get(strgs.helpProjectTemplateSupport),
			commandName:'help'
		};
		let readyForReturn:boolean=false;
		while(!readyForReturn){
			const cpsyncSettings=vscode.workspace.getConfiguration('circuitpythonsync');
			let projTemplatePaths:string[]=cpsyncSettings.get(strgs.confCPTemplatePathListPKG,[]);
			let picks:vscode.QuickPickItem[]=[
				{
				label: strgs.projAddTemplateLinkitemUrl
				},
				{
				label: strgs.projAddTemplateLinkitemPath
				}
			];
			// if there are existing items on list, add for deleting
			if(projTemplatePaths && projTemplatePaths.length>0) {
				// ** add a separator before the next two picks
				picks.push({
					label: '',
					kind: vscode.QuickPickItemKind.Separator
				});
				// ** add the paths to the pick list
				// ** #85, add description to each pick that shows start and end of string so can tell better the template
				const existingPicks=projTemplatePaths.map((path:string) => {
					return {
						label: '$(trash)'+path,
						detail: path.length > 45 ?
						`      ${path.substring(0, 15)}...${path.substring(path.length - 30)}` : // show start and end of string
						`      ${path}` // if path is short enough just show it all
					};
				});
				picks.push(...existingPicks);
			}
			// ** #72, use full quick pick so can have button for help
			const choiceWbutton=await showFullQuickPick(
				{
					title: strgs.projAddTemplateLinkTitle,
					placeholder: strgs.projAddTemplateLinkPlaceholder,
					buttons:[helpButton],
					items:picks,
					shouldResume: shouldResume		//shouldResume
				}
			);
			// const choice=await vscode.window.showQuickPick(picks,
			// 	{title: strgs.projAddTemplateLinkTitle,placeHolder: strgs.projAddTemplateLinkPlaceholder,
			// 	canPickMany:false}
			// );
			let choice:vscode.QuickPickItem | undefined=undefined;
			if(choiceWbutton && isCmdQuickInputButton(choiceWbutton)){ 
				if(choiceWbutton.commandName==='help'){
					// ** #72, open the help page
					vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpProjectTemplateSupport);
					choice=undefined;	//get out of this loop
					return;
				}
			}
			if(choiceWbutton && !isCmdQuickInputButton(choiceWbutton)){
				choice=choiceWbutton as vscode.QuickPickItem;
			} else {
				choice=undefined;	//get out of this loop
			}
			// ** if no choice that is cancel, get out
			if(!choice){
				readyForReturn=true;
				break;
			}
			if(choice.label===strgs.projAddTemplateLinkitemUrl){
				// ** get the url from the user
				const newTemplateUrl=await vscode.window.showInputBox({
					title: strgs.projAddTemplateLinkUrl,
					placeHolder: strgs.projAddTemplateLinkUrlPlchld,
					validateInput: (text) => {
						if(text && text.length>0){
							return null;
						} else {
							return strgs.projAddTemplateLinkUrlErr;
						}
					}
				});
				if(!newTemplateUrl) {continue;}	//if no pick or error just bring main qp back up
				// ** add the url to the list
				if(!projTemplatePaths.includes(newTemplateUrl)) {
					projTemplatePaths.push(newTemplateUrl);
				} else {
					vscode.window.showWarningMessage(strgs.projAddTemplateLinkUrlDup);
				}
				// ** set the new template path in the config, get method will use it
				await cpsyncSettings.update(strgs.confCPTemplatePathListPKG,projTemplatePaths, vscode.ConfigurationTarget.Global);

				//projTemplatePath=newTemplateUrl;	// ** NO, don't change since won't update array
			} else if (choice.label===strgs.projAddTemplateLinkitemPath){
				// ** get the path from the user
				const newTemplatePath=await vscode.window.showOpenDialog({
					canSelectFiles:true,
					canSelectFolders:false,
					canSelectMany:false,
					defaultUri: vscode.Uri.parse('/'),
					title: strgs.projAddTemplateLinkPath
				});
				if(!newTemplatePath) {continue;}	//if no pick just bring main qp back up
				// ** add the path to the list
				if(!projTemplatePaths.includes(newTemplatePath[0].fsPath)) {
					projTemplatePaths.push(newTemplatePath[0].fsPath);
				} else {
					vscode.window.showWarningMessage(strgs.projAddTemplateLinkPathDup);
				}
				// ** set the new template path in the config, get method will use it
				await cpsyncSettings.update(strgs.confCPTemplatePathListPKG,projTemplatePaths, vscode.ConfigurationTarget.Global);
				// ** set the new template path in the config, get method will use it
				//projTemplatePath=newTemplatePath[0].fsPath;	// ** NO, don't change since won't update array
			} else if (choice.label.startsWith('$(trash)')) {
				// ** delete the path from the list
				const delPath=choice.label.replace('$(trash)','');	//remove trash icon
				const index=projTemplatePaths.indexOf(delPath);
				if(index>-1) {
					projTemplatePaths.splice(index,1);
					// ** set the new template path in the config, get method will use it
					await cpsyncSettings.update(strgs.confCPTemplatePathListPKG,projTemplatePaths, vscode.ConfigurationTarget.Global);
				} else {
					vscode.window.showWarningMessage(strgs.projAddTemplateLinkDelErr);
				}
			}
		}
		//check to see if flag is set
		if(typeof fromMakeProject !== 'undefined' && fromMakeProject){
			// ** #57, return to make project command 
			vscode.commands.executeCommand(makeNewProjectId,strgs.projTemplateQPItemAddNew);
			return;
		}
	});
	context.subscriptions.push(addNewTemplateLinkCmd);
	
	// ** diff file **
	const cmdFileDiffId =strgs.cmdFileDiffPKG;
	//const fileDiffCmd=vscode.commands.registerCommand(cmdFileDiffId, async (...args) =>{
	const fileDiffCmd=vscode.commands.registerCommand(cmdFileDiffId, async (ctxFile:vscode.Uri|undefined) =>{
		// Capture required modules in local variables to ensure they're available in this scope
		const _vscode = vscode;
		const _os = os;
		const _strgs = strgs;
		// ** this is per claude 3.7 sonnet thinking 4/9/25
		let rootFolder:vscode.WorkspaceFolder|undefined;
		//const ctxFile:vscode.Uri|undefined=undefined;
		if(_vscode.workspace.workspaceFolders)	{			//if(!haveCurrentWorkspace) {
			rootFolder=_vscode.workspace.workspaceFolders[0];
		} else {
			_vscode.window.showInformationMessage(_strgs.mustHaveWkspce);
			return;
		}
		//also have to have drive mapping to try to compare to
		if(curDriveSetting==='') {
			_vscode.window.showInformationMessage(_strgs.mustSetDrvDiff);
			return;
		}
		// ** the arg array should have a length >=1 if context driven, else can look at active editor
		let fileUri:vscode.Uri;
		//if(args.length>0){
		if(ctxFile!==undefined){
			//[0]should be uri
			//fileUri=args[0] as vscode.Uri;
			fileUri=ctxFile as vscode.Uri;
		} else if(_vscode.window.activeTextEditor){
			fileUri=_vscode.window.activeTextEditor.document.uri;
		} else {
			//just bail
			_vscode.window.showWarningMessage(_strgs.diffContextWarning);
			return;
		}
		// ** switch to using glob pattern to search board
		// first remove root from fileUri to just get path
		//const rootFolder=vscode.workspace.workspaceFolders.[0];
		//if(!rootFolder) {return;}	//won't happen
		//if(!vscode.workspace.workspaceFolders){return;}	//won't happen
		//let leftFile:string=fileUri.fsPath.replace(vscode.workspace.workspaceFolders[0].uri.fsPath,'');
		let leftFile:string=fileUri.fsPath.replace(rootFolder.uri.fsPath,'');
		if(leftFile.startsWith('/') || leftFile.startsWith('\\')){
			leftFile=leftFile.slice(1);
		}
		//now try to find file on board mapping
		//need to add file scheme in windows
		let baseUri=curDriveSetting;
		if (_os.platform()==='win32') {
			baseUri='file:'+baseUri;
		}
		//now do rel pattern against the board
		const relPat=new _vscode.RelativePattern(_vscode.Uri.parse(baseUri),leftFile);
		let fles;
		try{
		fles=await _vscode.workspace.findFiles(relPat);
		} catch(error){
			const errMsg=_strgs.couldNotReadCpDnld[0]+curDriveSetting+_strgs.couldNotReadCpDnld[1];
			await _vscode.window.showErrorMessage(errMsg);
			return;
		}
		if(!fles || fles.length===0){
			// ** #112, check to see if file being compared (leftFile) is src in cpfiles and it is being mapped
			let cpFileLines=await parseCpfiles();
			if(cpFileLines && cpFileLines.length>0){
				cpFileLines=cpFileLines.filter(line => !line.inLib && line.src===leftFile && line.dest!=='');
				if(cpFileLines.length>0){
					//check if file exists on board and if so set the right compare fles[0]
					const relPatMap=new _vscode.RelativePattern(_vscode.Uri.parse(baseUri),cpFileLines[0].dest);
					try {
						fles=await _vscode.workspace.findFiles(relPatMap);
					} catch(error){
						const errMsg=_strgs.couldNotReadCpDnld[0]+curDriveSetting+_strgs.couldNotReadCpDnld[1];
						await _vscode.window.showErrorMessage(errMsg);
						return;
					}
					if(fles && fles.length>0){
						const ans=await _vscode.window.showWarningMessage(_strgs.diffBoardFileNoExistMapped[0]+cpFileLines[0].dest+_strgs.diffBoardFileNoExistMapped[1],'Yes','No');
						if(ans!=='Yes'){
							return;
						}
						leftFile=leftFile+'<>'+cpFileLines[0].dest;	// just for title of compare window
					} else { 
						_vscode.window.showErrorMessage(_strgs.diffBoardFileNoExist);
						return;
					}
				} else {
					_vscode.window.showErrorMessage(_strgs.diffBoardFileNoExist);
					return;
				}
			} else {
				_vscode.window.showErrorMessage(_strgs.diffBoardFileNoExist);
				return;
			}
		}
		// now compare files
		_vscode.commands.executeCommand('vscode.diff',fileUri,fles[0],_strgs.diffScreenHeader+leftFile);
		return;
		/*
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
		//so now see if board contents has the file
		if(!dirContents.some(entry => fileUri.path.endsWith('/'+entry[0]) || 
			fileUri.path.endsWith('\\'+entry[0])
		)){
			vscode.window.showErrorMessage("Selected file does not exist on board.");
			return;
		}
		//got the files to compare, by uri, need the base filename
		const filename=dirContents.find(entry => fileUri.path.endsWith('/'+entry[0]) || 
		fileUri.path.endsWith('\\'+entry[0]));
		if(!filename){return;}	//we know it is there
		vscode.commands.executeCommand('vscode.diff',fileUri,vscode.Uri.joinPath(vscode.Uri.parse(baseUri),filename[0]),'Workspace to Board compare file: '+filename[0]);
		*/
	});
	context.subscriptions.push(fileDiffCmd);

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
				// ** #36, refresh the board explorer
				bfe.boardFileProvider.refresh(curDriveSetting);
			}
			// #73, update drive map button
			statusBarMapDrv.tooltip=curDriveSetting ? new vscode.MarkdownString(`CP Drive- ${curDriveSetting}`) : strgs.cpDrvSel;
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
			// #101, need to add defaults because there may be libs (and cpFileLines always has array)
			const cpFileLinesDfltPy=[
				{
					src:'code.py', dest:'',	inLib:false
				},
				{
					src: 'main.py',	dest: '', inLib: false
				}
			];
			cpFileLines=[...cpFileLines,...cpFileLinesDfltPy];
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

	// ** #118 - utility to call in startup and watchers to update file decorations showing files that will be copied
	// ** #115 - also add badge to folders if files contained will be copied
	async function updateFileDecorations(cpFileLines:Array<cpFileLine>) {
		if(haveCurrentWorkspace && vscode.workspace.workspaceFolders){
			const rootFolder=  vscode.workspace.workspaceFolders[0];
			let decRfshUris:Array<vscode.Uri>=new Array<vscode.Uri>();
			let decRfshFolderUris:Array<vscode.Uri>=new Array<vscode.Uri>();
			let decRfshFolderPaths:Array<string>=new Array<string>();
			let libPath:string=await getLibPath();
			let libWholeCopy:boolean=true;
			for(const cpFln of cpFileLines){
				if(cpFln.src && cpFln.src.length>0){
					if(!cpFln.inLib){
						decRfshUris.push(vscode.Uri.joinPath(rootFolder.uri,cpFln.src));
						// check to see if src has a folder, add to list for folder decoration
						if(cpFln.src.includes('/')){
							const srcPath=parseCpFilePath(cpFln);
							if(srcPath.path!==''){
								decRfshFolderPaths.push(srcPath.path);
							}
						}
					} else {
						libWholeCopy=false;
						decRfshUris.push(vscode.Uri.joinPath(rootFolder.uri,libPath,cpFln.src));
						// add the lib folder to folder decoration paths, not to file decs
						decRfshFolderPaths.push(libPath);
					}
				}
			}
			if(libPath!=='' &&  libWholeCopy){
				//if whole library copy, just decorate the library folder
				decRfshUris.push(vscode.Uri.joinPath(rootFolder.uri,libPath));
			}
			// get unique set of folder paths to decorate
			decRfshFolderPaths=[...new Set(decRfshFolderPaths)];
			// now get the folder uris from the paths
			decRfshFolderUris=decRfshFolderPaths.map((path) => {
				return vscode.Uri.joinPath(rootFolder.uri,path);
			});
			//first decorate the folders...
			fileDec.refreshFolders(decRfshFolderUris);
			//now the files
			fileDec.refresh(decRfshUris);
		}
	}
	
	// ** Assign the function to global variable for external access
	globalUpdateFileDecorations = updateFileDecorations;

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
			// #101, need to add defaults because there may be libs (and cpFileLines always has array)
				const cpFileLinesDfltPy=[
					{
						src:'code.py', dest:'',	inLib:false
					},
					{
						src: 'main.py',	dest: '', inLib: false
					}
				];
				cpFileLines=[...cpFileLines,...cpFileLinesDfltPy];
			}
			// ** #118 - update file decorations showing files that will be copied
			await updateFileDecorations(cpFileLines);
			//
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
			// #101, need to add defaults because there may be libs (and cpFileLines always has array)
				const cpFileLinesDfltPy=[
					{
						src:'code.py', dest:'',	inLib:false
					},
					{
						src: 'main.py',	dest: '', inLib: false
					}
				];
				cpFileLines=[...cpFileLines,...cpFileLinesDfltPy];
			}
			// ** #118 - update file decorations showing files that will be copied
			await updateFileDecorations(cpFileLines);
			//
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
			// ** #118 - update file decorations showing files that will be copied
			await updateFileDecorations(cpFileLines);
			//
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
			if(!cpfilesEditNoAskAgain && !origCpLines.some(lne => lne.inLib)){
				const ans=await vscode.window.showWarningMessage(strgs_warnNoLibsInCP,"Yes","No","No, don't ask again","Help");
				toastShown=true;
				if(ans==="Yes"){
					triggerEdit=true;
				} else if (ans==="No, don't ask again") {
					// ** #125, set the flag to not ask again
					cpfilesEditNoAskAgain=true;
				} else if (ans==="Help") {
					vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpLibsCopySupport);
					return;
				}
			}
			//then if didn't ask about library (that is, there were some), see if there are no code files
			if(!toastShown && !cpfilesEditNoAskAgain && cpLinesPy.length===0){
				const ans=await vscode.window.showWarningMessage(strgs_noCodeFilesInCp,"Yes","No","No, don't ask again","Help");
				toastShown=true;
				if(ans==="Yes"){
					triggerEdit=true;
				} else if (ans==="No, don't ask again") {
					// ** #125, set the flag to not ask again
					cpfilesEditNoAskAgain=true;
				} else if (ans==="Help") {
					vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
					return;
				}
			} else {
				// ** Per #26, also give warning/edit opp if no python files in files only set, and some no exist
				//  ALSO these conditions are from checkSources now
				//  ** try to show just one message, so offer a combined if so
				if(!toastShown && !cpfilesEditNoAskAgain && fileSources.noPyFiles && !fileSources.filesNoExist){
					const ans=await vscode.window.showWarningMessage(strgs_noPyCodeFilesInCp,"Yes","No","No, don't ask again","Help");
					toastShown=true;
					if(ans==="Yes"){
						triggerEdit=true;
					} else if (ans==="No, don't ask again") {
						// ** #125, set the flag to not ask again
						cpfilesEditNoAskAgain=true;
					} else if (ans==="Help") {
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
						return;
					}
				}
				if(!toastShown && !cpfilesEditNoAskAgain && fileSources.filesNoExist && !fileSources.noPyFiles){
					const ans=await vscode.window.showWarningMessage(strgs_fileInCpNoExist,"Yes","No","No, don't ask again","Help");
					toastShown=true;
					if(ans==="Yes"){
						triggerEdit=true;
					} else if (ans==="No, don't ask again") {
					// ** #125, set the flag to not ask again
					cpfilesEditNoAskAgain=true;
					} else if (ans==="Help") {
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
						return;
					}
				}
				if(!toastShown && !cpfilesEditNoAskAgain && fileSources.filesNoExist && fileSources.noPyFiles){
					const ans=await vscode.window.showWarningMessage(strgs_noPyAndNonExistFilesInCp,"Yes","No","No, don't ask again","Help");
					toastShown=true;
					if(ans==="Yes"){
						triggerEdit=true;
					} else if (ans==="No, don't ask again") {
						// ** #125, set the flag to not ask again
						cpfilesEditNoAskAgain=true;
					} else if (ans==="Help") {
						vscode.commands.executeCommand(strgs.cmdHelloPKG,strgs.helpFilesCopySupport);
						return;
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
			// #101, need to add defaults because there may be libs (and cpFileLines always has array)
				const cpFileLinesDfltPy=[
					{
						src:'code.py', dest:'',	inLib:false
					},
					{
						src: 'main.py',	dest: '', inLib: false
					}
				];
				cpFileLines=[...cpFileLines,...cpFileLinesDfltPy];
			}
			// ** #118 - update file decorations showing files that will be copied
			await updateFileDecorations(cpFileLines);
			//
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

	// **#72, offer help at startup with options to not ask again
	if(haveCurrentWorkspace){
		// get the current setting for not showing help
		const doNotShowWelcome=vscode.workspace.getConfiguration('circuitpythonsync').get(strgs.confNoShowHelpPKG,false);
		if(!doNotShowWelcome){
			const ans=await vscode.window.showInformationMessage(strgs.welcomeHelpAskMsg,
				{modal:true,detail:strgs.welcomeHelpAskDetail},'Yes','Yes but not again for this project','No and never for my user');
			if(ans && ans.toLowerCase().startsWith('yes')){
				vscode.commands.executeCommand(strgs.cmdHelloPKG);
				if(ans === 'Yes but not again for this project'){
					// ** #72, set the config to not show help again in setting.json
					await vscode.workspace.getConfiguration('circuitpythonsync').update(strgs.confNoShowHelpPKG,true, vscode.ConfigurationTarget.Workspace);
				}
			} else if(ans && ans.toLowerCase().startsWith('no')){
				// ** #72, set the config to not show help again for the user
				await vscode.workspace.getConfiguration('circuitpythonsync').update(strgs.confNoShowHelpPKG,true, vscode.ConfigurationTarget.Global);
			}
			// note that if cancel nothing shows but nothing changes
		}
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
