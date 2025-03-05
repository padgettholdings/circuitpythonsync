// **NOTES**
// messages with markdown suffixed with MKDN, check for validity before change
// strings that also show up in package.json suffixed with PKG, must change there too!

//helper for quickpick item text
interface qpitem {
    label: string;
    description?: string;
    detail?: string;
}
//helper for input box options
interface ibox {
    prompt: string;
    placeHolder?: string;
}

// workspace config setting for current drive path, fixed to prefix with 'circuitpythonsync.'
//  CAN CHANGE HERE TO CHANGE AND RECOMPILE IN CODE, BUT package.json will need to be changed also
export const confDrivepathPKG:string ='drivepath';
// these are for the lib and stub mgmt settings, fixed to prefix with 'circuitpythonsync.'
export const confCurlibPKG:string ='curlibtag';
export const confCPbaseverPKG:string ='cpbaseversion';
export const confCPfullverPKG:string ='cpfullversion';
export const confBoardNamePKG:string ='cpboardname';
// the python/pylance setting for extra paths, DO NOT prefix with 'circuitpythonsync.'
// **NOT currently in package.json, but can be added if needed**
export const confPyExtraPathsPKG:string ='python.analysis.extraPaths';
//context key used in package.json for enablement
export const libUpdatingContextKeyPKG:string='circuitpythonsync.updatinglibs';


//command strings are also in package.json
export const cmdHelloPKG:string ='circuitpythonsync.helloWorld';
export const cmdBtn1PKG:string ='circuitpythonsync.button1';
export const cmdBtn2PKG:string ='circuitpythonsync.button2';
export const cmdSetDirPKG:string ='circuitpythonsync.opendir';
export const cmdMngLibPKG:string ='circuitpythonsync.mngcplibs';
export const cmdMngFilesPKG:string='circuitpythonsync.mngcpfiles';
export const cmdDownloadCPboardPKG:string = 'circuitpythonsync.dnldcpboard';
export const cmdScaffoldProjectPKG:string= 'circuitpythonsync.newproject';
export const cmdLibUpdatePKG:string='circuitpythonsync.libupdate';
export const cmdSelectLibsPKG:string='circuitpythonsync.selectlibs';

//change to have different name for manifest file
// ** these can be overriden in main file by configuration pulls **
export const cpfiles:string= 'cpfiles.txt';
export const cpfilesbak:string= 'cpfiles.bak';
export const noWriteCpfile:string = `Could not write ${cpfiles}`;
export const mngLibChooseLibs:string = `Choose Libraries for ${cpfiles}`;
export const mngFileChooseFiles:string=`Choose Files for ${cpfiles}`;
export const noCodeFilesInCp:string =`No code files included in ${cpfiles} mapping, so only code.py or main.py will be copied.  Would you like to edit?`;
export const noPyCodeFilesInCp:string =`No python files included in ${cpfiles} mapping, so none will be copied.  Would you like to edit?`;
export const fileInCpNoExist:string =`At least one filename included in ${cpfiles} mapping does not exist.  Would you like to edit?`;
export const noPyAndNonExistFilesInCp:string = `Two issues in ${cpfiles} mapping: No Python file, and some files do not exist.  Would you like to edit?`;
export const warnNoLibsInCP:string = `No libraries listed in ${cpfiles} so all libraries will be copied.  Would you like to edit?`;
// ** also need exported function to re-gen these messages after pulling from config **
export function getCpFilesMsgs(strgs_cpfiles:string):[strgs_noWriteCpfile:string,strgs_mngLibChooseLibs:string,strgs_mngFileChooseFiles:string,strgs_noCodeFilesInCp:string,strgs_noPyCodeFilesInCp:string,strgs_fileInCpNoExist:string,strgs_noPyAndNonExistFilesInCp:string,strgs_warnNoLibsInCP:string]{
    const strgs_noWriteCpfile:string = `Could not write ${strgs_cpfiles}`;
    const strgs_mngLibChooseLibs:string = `Choose Libraries for ${strgs_cpfiles}`;
    const strgs_mngFileChooseFiles:string=`Choose Files for ${strgs_cpfiles}`;
    const strgs_noCodeFilesInCp:string =`No code files included in ${strgs_cpfiles} mapping, so only code.py or main.py will be copied.  Would you like to edit?`;
    const strgs_noPyCodeFilesInCp:string =`No python files included in ${strgs_cpfiles} mapping, so none will be copied.  Would you like to edit?`;
    const strgs_fileInCpNoExist:string =`At least one filename included in ${strgs_cpfiles} mapping does not exist.  Would you like to edit?`;
    const strgs_noPyAndNonExistFilesInCp:string = `Two issues in ${strgs_cpfiles} mapping: No Python file, and some files do not exist.  Would you like to edit?`;
    const strgs_warnNoLibsInCP:string = `No libraries listed in ${strgs_cpfiles} so all libraries will be copied.  Would you like to edit?`;
    return [strgs_noWriteCpfile,strgs_mngLibChooseLibs,strgs_mngFileChooseFiles,strgs_noCodeFilesInCp,strgs_noPyCodeFilesInCp,strgs_fileInCpNoExist,strgs_noPyAndNonExistFilesInCp,strgs_warnNoLibsInCP];
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
export const mngFileChecks:string = 'Check or uncheck desired files';
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
export const destMapsDel:string='Destination mappings can be preserved or deleted, or cancel all?';
export const cnfrmEntireLib:string='No lib folders/files selected, entire lib folder will be copied, continue?';
export const cnfrmNoPyFiles:string='No python files selected, only code.py/main.py will be copied, continue?';
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

//library and stubs related
export const workspaceLibArchiveFolder:string='libArchive';
export const updateLibQPtitle:string='Update Libraries';
export const updateLibQPSelTT:string='Select Libraries for Board';
export const updateLibQPSelPlaceholder:string='Accept or change the library tag and CircuitPython version';
export const updateLibQPItemTop:qpitem={label:'Enter or click here to update with current settings',description:'Or click library tag or CP version to change'};
export const updateLibQPItemMiddle:qpitem={label:'Library Tag'};
export const updateLibQPItemBottom:qpitem={label:'CircuitPython Version'};
export const libBaseNoMatchFullVer:string='CircuitPython lib version does not match full CP version, correct in .vscode/settings.json';
export const libTagOrCPVerChgConfirm:string[]=[
    'Library tag or CP version changed, do you want to update to tag ', //+libTag+
    ', CP ' //+cpVersion+
];
export const libTagChgInputBox:ibox={prompt:'Enter the library tag or blank for latest',placeHolder:'Enter with blank input to go to latest version.'};
export const libTagChgConfirm:string='Are you sure you want Library tag changed to: ';  //+value of new libtag
export const updateLibNewTagQPplaceholder:string="Accept to save changed settings and update libraries";
export const updateLibNewTagQPItemTop:qpitem={label:'Enter or click here to update with NEW settings',description:'Or click library tag or CP version to change'};
export const updateLibNewTagQPItemMiddle:qpitem={label:'Library Tag'};
export const updateLibNewTagQPItemBottom:qpitem={label:'CircuitPython Version'};
export const libTagLatestChgConfirm:string='Are you sure you want Library tag changed to latest version: '; //+ latestTag
export const cpVerChgInputBox:ibox={prompt:'Enter the CircuitPython version'};
export const cpVerChgConfirm:string='Are you sure you want CP version changed to: ';  // + value of new cp version
export const updateCpNewVerQPplaceholder:string="Accept to save changed settings and update libraries";
export const updateCpNewVerQPItemTop:qpitem={label:'Enter or click here to update with NEW settings',description:'Or click library tag or CP version to change'};
export const updateCpNewVerQPItemMiddle:qpitem={label:'Library Tag'};
export const updateCpNewVerQPItemBottom:qpitem={label:'CircuitPython Version'};
export const libBundleFilePrefix:string='adafruit-circuitpython-bundle';    // this is just for internal files NOT the URL
export const libBundleAdafruitUrlRoot:string='https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/download';
export const libBundleAdafruitUrlLatest:string='https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/latest';
export const libCPAdafruitUrlLatest:string="https://github.com/adafruit/circuitpython/releases/latest";
export const libBundleAdafruitUrlFilePrefix:string='adafruit-circuitpython-bundle';
export const selLibQPtitle:string='Select libraries';
export const selLibQPplaceholder:string='Select Libraries to Add';
export const setupLibProgressMsg:string='Check and load lib files...';
export const setupLibNoWSError:string='No workspace is open, cannot init library management';
export const setupLibDnldError:string='Error downloading the original lib bundle zip files';
export const setupLibExtractError:string='Error extracting the lib folders from the original bundle zip files';
export const updateLibProgressMsg:string="Updating Libraries...";
export const updateLibProgressTitle:string="Library Maintenance Progress";
export const updateLibProgressCancelLog:string="User canceled the long running operation";
export const updateLibNoLibsToUpdate:string='No libraries to update';
export const updateLibMetadataError:string='Library metadata file not found';
export const updateLibExtractStubsError:string='Error extracting the lib stubs from the original bundle zip files';
export const updateLibExtractLibsError:string='Error extracting the lib files from the original bundle zip files';
export const updateLibUpdatedMsg:string[]=[
    'Libraries updated for tag: ', //+libTag+
    ' and CP version: ' //+cpVersion+
];
export const libCmdsReadyNeedSettingsError:string='Please set the library tag and CircuitPython versions in the settings';
export const libCmdsReadyVerChgError:string='Library tag or CircuitPython versions changed, run update first before adding new libs';
export const libCmdsReadyNoSourceError:string='Library source files not found, run update first';
export const libCmdsReadyNoMetadataError:string='Library metadata file not found, run update first';
export const libDnldBundleExistsLog:string='File already exists:';
export const libDnldBundleExistsRtn:string='file already exists';
export const libDnldBundleSuccessRtn:string='File downloaded successfully for fmt:';  // + pyLibFmt
export const libDnldBundleErrorMsg:string='Error downloading the file:';
export const libDnldMetadataExistsLog:string='File already exists:';
export const libDnldMetadataExistsRtn:string='file already exists';
export const libDnldMetadataSuccessLog:string='Downloaded lib metadata to:';
export const libDnldMetadataErrorLog:string='Error downloading the file:';
export const getOrigBundleLog:string[]=[
    'Downloaded orig bundle for pylibfmt: ',  // + pyLibFmt
    ' with result:'  // + res
];


