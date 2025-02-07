// **NOTES**
// messages with markdown suffixed with MKDN, check for validity before change
// strings that also show up in package.json suffixed with PKG, must change there too!

// workspace config setting for current drive path, fixed to prefix with 'circuitpythonsync.'
//  CAN CHANGE HERE TO CHANGE AND RECOMPILE IN CODE, BUT package.json will need to be changed also
export const confDrivepathPKG:string ='drivepath';

//command strings are also in package.json
export const cmdHelloPKG:string ='circuitpythonsync.helloWorld';
export const cmdBtn1PKG:string ='circuitpythonsync.button1';
export const cmdBtn2PKG:string ='circuitpythonsync.button2';
export const cmdSetDirPKG:string ='circuitpythonsync.opendir';
export const cmdMngLibPKG:string ='circuitpythonsync.mngcpfiles';
export const cmdDownloadCPboardPKG:string = 'circuitpythonsync.dnldcpboard';
export const cmdScaffoldProjectPKG:string= 'circuitpythonsync.newproject';

//change to have different name for manifest file
// ** these can be overriden in main file by configuration pulls **
export const cpfiles:string= 'cpfiles.txt';
export const cpfilesbak:string= 'cpfiles.bak';
export const noWriteCpfile:string = `Could not write ${cpfiles}`;
export const mngLibChooseLibs:string = `Choose Libraries for ${cpfiles}`;
export const noCodeFilesInCp:string =`No code files included in ${cpfiles} mapping, so only code.py or main.py will be copied.  Would you like to edit?`;
export const noPyCodeFilesInCp:string =`No python files included in ${cpfiles} mapping, so none will be copied.  Would you like to edit?`;
export const fileInCpNoExist:string =`At least one filename included in ${cpfiles} mapping does not exist.  Would you like to edit?`;
export const noPyAndNonExistFilesInCp:string = `Two issues in ${cpfiles} mapping: No Python file, and some files do not exist.  Would you like to edit?`;
export const warnNoLibsInCP:string = `No libraries listed in ${cpfiles} so all libraries will be copied.  Would you like to edit?`;
// ** also need exported function to re-gen these messages after pulling from config **
export function getCpFilesMsgs(strgs_cpfiles:string):[strgs_noWriteCpfile:string,strgs_mngLibChooseLibs:string,strgs_noCodeFilesInCp:string,strgs_noPyCodeFilesInCp:string,strgs_fileInCpNoExist:string,strgs_noPyAndNonExistFilesInCp:string,strgs_warnNoLibsInCP:string]{
    const strgs_noWriteCpfile:string = `Could not write ${strgs_cpfiles}`;
    const strgs_mngLibChooseLibs:string = `Choose Libraries for ${strgs_cpfiles}`;
    const strgs_noCodeFilesInCp:string =`No code files included in ${strgs_cpfiles} mapping, so only code.py or main.py will be copied.  Would you like to edit?`;
    const strgs_noPyCodeFilesInCp:string =`No python files included in ${strgs_cpfiles} mapping, so none will be copied.  Would you like to edit?`;
    const strgs_fileInCpNoExist:string =`At least one filename included in ${strgs_cpfiles} mapping does not exist.  Would you like to edit?`;
    const strgs_noPyAndNonExistFilesInCp:string = `Two issues in ${strgs_cpfiles} mapping: No Python file, and some files do not exist.  Would you like to edit?`;
    const strgs_warnNoLibsInCP:string = `No libraries listed in ${strgs_cpfiles} so all libraries will be copied.  Would you like to edit?`;
    return [strgs_noWriteCpfile,strgs_mngLibChooseLibs,strgs_noCodeFilesInCp,strgs_noPyCodeFilesInCp,strgs_fileInCpNoExist,strgs_noPyAndNonExistFilesInCp,strgs_warnNoLibsInCP];
}


//status bar button label text, keep short, icon usually to right
export const btnCopyLbl:string ='CPCopy';
export const btnLibLbl:string ='CPLib';
export const btnLightBkgd:string ='statusBarItem.warningBackground';

//file to try to determine if path has circuit python boot file, only change if adafruit does
// ** this can be overriden in main file by configuration pulls **
export const cpBootFile:string ='boot_out.txt';
export const cpBootNoFindMKDN:string =`**NOTE that ${cpBootFile} not found**`;
// ** and export function to re-calc message
export function getCpBootMsgs(strgs_cpBootFile:string):[strgs_cpBootNoFindMKDN:string]{
    const strgs_cpBootNoFindMKDN:string=`**NOTE that ${strgs_cpBootFile} not found**`;
    return [strgs_cpBootNoFindMKDN];
}

//various messages
export const mngLibChecks:string = 'Check or uncheck desired files and folders';
export const mustMapMKDN:string='**MUST MAP DRIVE FIRST**';
export const noFilesMKDN:string='**NO FILES EXIST THAT ARE TO BE COPIED**';
export const enabledToCopy:string='Enabled to copy to ';  //+curDriveSetting'
export const canCopyInsCurDrive:string[]=[
    'Can copy to ', //+curDriveSetting + 
    ' BUT not USB drive!'
];
export const mustHaveWkspce:string='!! Must have open workspace !!';
export const mustSetDrv:string='!! Must set drive before copy !!';
export const noFilesSpecd:string='!! No files specified to copy exist !!';
export const noLibSpecd:string='!! No libraries specified to copy exist !!';
export const warnEntireLib:string='WARNING! Entire lib folder will be copied, continue?';
export const noLibDir:string='!! No libraries yet created !';
export const destMapsDel:string='Destination mappings will be deleted, continue?';
export const cnfrmEntireLib:string='No lib folders/files selected, entire lib folder will be copied, continue?';
export const fndCPDrvInsPath:string[]=[
    'Found a potential CircuitPython Board on drive: "', //+connectDrvPath+'"
    '".  Do you want to map it?'
];
export const pickManual:string='Pick Manually';
export const autoDetect:string='Auto Detected';
export const autoDetectNotUSB:string='Auto Detected but NOT USB';
export const errListingDrv:string='Error listing drives:';
export const pickDrvOrManual:string='Pick detected drive or select manually';
export const cpDrvSel:string='CP Drive Select';
export const pickDrvOrMount:string='Pick drive or mount point for CP';
export const pickCommentFlag:string="Commented";

//download related strings
export const couldNotReadCpDnld:string[]=[
    '!! Could not read mapped circuit python drive: "', //+curDriveSetting+
    '".  Check connection.'
];
export const pickAllowOverwrite:string='Allow Overwrite?';
export const pickSkipDots:string='Skip Dot files and folders?';
export const pickStdFoldersOnly:string='Download only standard folders?';
export const dnldCfgQpTitle:string='Choose Download Options';
export const dnldCfgQpPlchld:string='Check for yes, uncheck for no';
export const dnldWarnOverwrite:string='File/Folder exists and overwrite not configured, skipping: '; //+file copying
export const dnldCopyError:string='Copy Error, aborting, error: ';  //+error.message

// project template related
export const projTemplateNoLoad:string='** ERROR - could not load cp project template.';
export const projTemplateAskDnld:string='Would you rather download from the mapped drive?';
export const projTemplateConfOverwrite:string='Workspace already has files, overwrite?';
export const projTemplateErrWriteFolder:string='** ERROR in writing new project folder: ';  //+fse.message
export const projTemplateErrWriteFile:string='** ERROR in writing new project file: ';  //+fse.message

//file and library related strings
export const abortFileCopyError:string='Aborting file copy trying to read device with error: ';     //+fse.message
export const errorCopyingFile:string='** Error copying file: ';     //+fse.message
export const abortLibCopyError:string='Aborting lib copy trying to read device with error: ';       //+fse.message
export const abortWholeLibCopyError:string='** Aborting lib copy with error: ';     //+fse.message
export const wholeLibCopyDone:string='** Entire library copy done. **';
export const errorCopyingLibFile:string='** Error copying lib file: ';      //+fse.message

//board explorer and diff related
export const boardFileDeleteError:string="** Error with file delete: ";   //+fse.message
export const boardFileConfDelete:string="Are you sure you want to permanently delete from board?";
export const boardUnkTypeFileFolder:string="** Unknown type of file/folder, cannot be deleted.";
export const diffContextWarning:string='Must have active file in editor, or use context menu in explorer.';
export const diffBoardFileNoExist:string="Selected file does not exist on board.";
export const diffScreenHeader:string='Workspace to Board compare file: ';   //+leftFile
