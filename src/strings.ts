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
//context keys used in package.json for enablement
export const libUpdatingContextKeyPKG:string='circuitpythonsync.updatinglibs';
export const stubsUpdatingContextKeyPKG:string='circuitpythonsync.updatingstubs';


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
export const cmdSelectBoardPKG:string='circuitpythonsync.selectboard';
export const cmdLoadProjectBundlePKG:string='circuitpythonsync.loadProjectBundle';

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
export const btnCopyLbl:string = 'CP$(files)$(arrow-small-right)';   //'CPCopy';
export const btnLibLbl:string = 'CP$(library)$(arrow-small-right)'; //'CPLib';
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
export const btnFilesTTPrefixMKDN:string="***Files***-";
export const btnLibsTTPrefixMKDN:string="***Libs***-";
export const mustMapMKDN:string='**MUST MAP DRIVE FIRST**';
export const noFilesMKDN:string='**NO FILES EXIST THAT ARE TO BE COPIED**';
export const enabledToCopyMKDN:string='Enabled to copy to ';  //+curDriveSetting'
export const canCopyInsCurDriveMKDN:string[]=[
    'Can copy to ', //+curDriveSetting + 
    ' BUT may not be CP drive!'
];
export const mustHaveWkspce:string='!! Must have open workspace !!';
export const mustSetDrv:string='!! Must select drive before copy operation !!';
export const mustSetDrvDnld:string='!! Must select drive before download !!';
export const mustSetDrvDiff:string='!! Must select drive before diff operation !!';
export const noFilesSpecd:string='!! No files specified to copy exist !! Showing help...';
export const noLibSpecd:string='!! No libraries specified to copy exist !! Showing help...';
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
export const autoDetectNotUSB:string='Auto Detected but may not be CP';
export const errListingDrv:string='Error listing drives:';
export const errListingDrvBadBootPath:string='Error finding boot file when listing drives for path: ';
export const pickDrvOrManual:string='Pick detected drive or select manually';
export const cpDrvSel:string='CP Drive Select';
export const pickDrvOrMount:string='Pick drive or mount point for CP';
export const pickDrvAskSelBoard:string='Do you also want to select a board type? ';
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
export const projTemplateNoLoad:string='** ERROR - could not load default cp project template.';
export const projTemplateGHNoLoad:string='** ERROR loading peronal cp project template from GitHub; try signing in your account again and restart. Code:';  //+err.message
export const projTemplatePersNoLoad:string='** ERROR loading peronal cp project template, code:';  //+err.message
export const projTemplateNoLoadUriErrCode:string='INVALID_FILE_PATH';
export const projTemplateAskDnld:string='Would you rather download from the mapped drive?';
export const projTemplateConfOverwrite:string='Workspace already has files, overwrite?';
export const projTemplateErrWriteFolder:string='** ERROR in writing new project folder: ';  //+fse.message
export const projTemplateErrWriteFile:string='** ERROR in writing new project file: ';  //+fse.message
export const projTemplateErrReadSettings:string='** ERROR in reading settings.json during project template setup: ';  //+fse.message
export const projTemplateErrParseSettings:string='** ERROR in parsing settings.json during project template setup: ';
export const projTemplateErrParseTemplateSettings:string='** ERROR in parsing template settings.json during project template setup: ';
export const projTemplateAskLibStub:string='Would you like to initialize the library and board Python stubs?';
export const projTemplateQPTitle:string='Make or Update Project from Templates';
export const projTemplateQPPlaceholder:string="Pick option for templating project "; //+(from default) or (from url/file)
export const projTemplateQPSepTop:string='Apply Template';
export const projTemplateQPItemAll:string='All files (overwrite) and settings (merge)';
export const projTemplateQpItemMerge:string="Merge settings only (no files)";
export const projTemplateQPItemSamples:string="Add Sample Files vs. overwrite, merge settings";
export const projTemplateQPItemPickSep:string='Templates';
export const projTemplateQPItemAddNew:string='Choose different template or add/remove from list';
export const projTemplateQPItemView:string='View selected template (raw text)';
export const projTemplateQPItemHiddenAddNewWSettings:string='addNewMergeSettingsOnly';  //hidden item to add new files, no overwrite, with settings merge
export const projTemplateAddMngQPitemAdd:string='Add new template or manage list...';
export const projTemplateAddMngQPTopSep:string='Templates';
export const projTemplateAddMngQPitemDflt:string='(use default)';
export const projTemplateAddMngQPBotSep:string='Choose';
export const projTemplateAddMngQPTitle:string='Choose personal template';
export const projTemplateAddMngQPTPlchldr:string='Pick the path or link to the desired template';
export const projTemplateViewTemplateDfltTitle:string='<DefaultTemplate>';
export const projAddTemplateLinkTitle:string='Add a new personal template or remove from list';
export const projAddTemplateLinkPlaceholder:string='Choose Add or click template to remove from list, or ESC to exit';
export const projAddTemplateLinkitemUrl:string='Add new URL';
export const projAddTemplateLinkitemPath:string='Add new local path';

export const projAddTemplateLinkUrl:string='Enter URL to new template';
export const projAddTemplateLinkUrlPlchld:string="Must be Https, if Github you must have access";
export const projAddTemplateLinkUrlErr:string='Error in URL, try again';
export const projAddTemplateLinkUrlDup:string='URL already exists in list, try again';
export const projAddTemplateLinkPath:string='Choose new template file to add';
export const projAddTemplateLinkPathDup:string='File already exists in list, try again';
export const projAddTemplateLinkDelErr:string='Error removing template file from list, try again';

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
export const extActivateAskLibStubs:string='Would you like to initialize the library and board Python stubs?';
export const workspaceLibArchiveFolder:string='libArchive';
export const updateLibQPtitle:string='Install or Update Libraries';
export const updateLibQPSelTT:string='Select Libraries for Board';
export const updateLibQPSelPlaceholder:string='';   //'Accept or change the library tag and CircuitPython version';
export const updateLibQPItemTop:qpitem={label:'Click to update with current bundle settings',description:'[Or click tag and/or version to modify]'}; //{label:'Enter or click here to update with current settings',description:'Or click library tag or CP version to change'};
export const updateLibQPItemMiddle:qpitem={label:'Library Tag'};
export const updateLibQPItemBottom:qpitem={label:'CircuitPython Version'};
export const libBaseNoMatchFullVer:string='CircuitPython lib version does not match full CP version, correct in .vscode/settings.json';
export const libTagOrCPVerChgConfirm:string[]=[
    'Library tag or CP version changed, do you want to update to tag ', //+libTag+
    ', CP ' //+cpVersion+
];
export const libTagChgInputBox:ibox={prompt:'Enter the library tag or blank for latest',placeHolder:'Enter with blank input to go to latest version.'};
export const libTagChgConfirm:string='Are you sure you want Library tag changed to: ';  //+value of new libtag
export const updateLibNewTagQPplaceholder:string="";    //"Accept to save changed settings and update libraries";
export const updateLibNewTagQPItemTop:qpitem={label:'Click to update with NEW bundle settings',description:'[Or click tag and/or version to modify]'};   //{label:'Enter or click here to update with NEW settings',description:'Or click library tag or CP version to change'};
export const updateLibNewTagQPItemMiddle:qpitem={label:'Library Tag'};
export const updateLibNewTagQPItemBottom:qpitem={label:'CircuitPython Version'};
export const libTagLatestChgConfirm:string='Are you sure you want Library tag changed to latest version: '; //+ latestTag
export const cpVerChgInputBox:ibox={prompt:'Enter the CircuitPython version'};
export const cpVerChgConfirm:string='Are you sure you want CP version changed to: ';  // + value of new cp version
export const updateCpNewVerQPplaceholder:string=''; //"Accept to save changed settings and update libraries";
export const updateCpNewVerQPItemTop:qpitem={label:'Click to update with NEW bundle settings',description:'[Or click tag and/or version to modify]'};  //{label:'Enter or click here to update with NEW settings',description:'Or click library tag or CP version to change'};
export const updateCpNewVerQPItemMiddle:qpitem={label:'Library Tag'};
export const updateCpNewVerQPItemBottom:qpitem={label:'CircuitPython Version'};
export const libBundleFilePrefix:string='adafruit-circuitpython-bundle';    // this is just for internal files NOT the URL
export const libBundleAdafruitUrlRoot:string='https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/download';
export const libBundleAdafruitUrlLatest:string='https://github.com/adafruit/Adafruit_CircuitPython_Bundle/releases/latest';
export const libCPAdafruitUrlLatest:string="https://github.com/adafruit/circuitpython/releases/latest";
export const libBundleAdafruitUrlFilePrefix:string='adafruit-circuitpython-bundle';
export const selLibQPtitle:string='Select libraries';
export const selLibQPplaceholder:string='Check Libraries to Add or uncheck to Remove';
export const selLibsNoLibFolder:string='No libraries folder found, create as "lib" before selecting?';      //yes or no
export const selLibDelLibError:string='Error deleting the selected library folder: ';   //+err.message
export const selLibAllCurLibsDel:string='All current libraries will be deleted (before new adds), continue?';
export const setupLibProgressMsg:string='Check and load lib files...';
export const setupLibNoWSError:string='No workspace is open, cannot init library management';
export const setupLibDnldError:string='Error downloading the original lib bundle zip files - try another bundle version';
export const setupLibExtractError:string='Error extracting the lib folders from the original bundle zip files';
export const setupLibGeneralError:string='Error setting up the libraries: ';    //+err.message
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
export const updateLibGeneralError:string='Error updating the libraries: ';    //+err.message
export const libCmdsReadyNeedSettingsError:string='Before selecting libraries run Install or Update Libraries to fetch bundle.';
export const libCmdsReadyVerChgError:string='Before selecting libraries run Install or Update Libraries due to pending version change.';
export const libCmdsReadyNoSourceError:string='Before selecting libraries run Install or Update Libraries';
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
export const selectBoardMustSetCPVer:string='Must set the CircuitPython full version in the settings.';
export const stubDnldErrorMsg:string='Error downloading stubs: ';   //+err
export const stubArchiveFolderName:string='stubArchive';
export const stubsGlobalStorageFolderName:string='stubs';
export const boardButtonSetTTMKDN:string[]=[
    '**',   //+board.label
    '** selected, click to change'
];
export const boardButtonNotSetTTMKDN:string='Click to Select CP board';
export const boardListSelectedQPItem:qpitem={label:'DNU',description:'Current selection'};
export const stubsTarGzExtractError:string='Error during extraction of ';   // ${tarGzPath}
export const stubsPyPiMetadataUrl:string='https://pypi.org/pypi/circuitpython-stubs/json';
export const stubsPyPiMetadataDnldLog:string='Downloaded cp stubs metadata to:';
export const stubsPyPiMetadataDnldErrorLog:string='Error downloading the file:';
export const stubsPyPiFileDnldSuccessRtn:string='File downloaded successfully at:'; // + stubFilePath
export const stubsPyPiFileDnldErrorLog:string='Error downloading the file:';
export const updateStubsProgressTitle:string="Py Stub Maintenance Progress";
export const updateStubsProgressCancelLog:string="User canceled the long running operation";
export const installStubsMustSetCPVer:string='Must set the CircuitPython full version in the settings.';
export const installStubsProgressMsg:string='Checking/Updating Python stubs...';
export const installStubsExtractErrMsg:string='Error extracting stubs tar file: ';  // + err
export const installStubsMetadataFilename:string='circuitpython-stubs.json';
export const installStubsMetadataGetError:string='Error getting pypi stubs metadata: ';  // + err
export const installStubsNoRelForCpVerErr:string='No releases found for tag: '; //+this._cpVersionFull
export const installStubsDnldErr:string='Error downloading stubs: ';  // + err
export const installStubsGetLatestCPTagErrMsg:string='Error getting latest CP tag: ';  // + err
export const installStubsGeneralError:string='Error installing stubs: ';  // + err.message
export const libBundleZipTempFilesToKeep:string='5';  //number of temp files to keep of each py type- MUST BE NUMBER
// ** project bundle related
export const projectBundleUrlTitle:string='Enter Project Bundle URL';
export const enterProjectBundleUrl:string='Enter a valid URL to the bundle, or just Enter for local file';
export const projectBundleUrlPlaceholder:string='URL must be https://, or Enter to pick file, or ESC to cancel';
export const projectBundleArchiveFolderName:string='projectBundleArchive';
export const projectBundleTempFolderName:string='projectBundleTemp';
export const projectBundleArchiveDirNotInitErr:string='Project bundle archive directory not initialized, restart';
export const projectBundleDnldExistsSkipQues:string='Project bundle by that ID already downloaded, Use it?';
export const projectBundleTempDirNotInitErr:string='Project bundle temp directory not initialized, restart';
export const projectBundleNoFindCPinZipErr:string='Did not find CircuitPython code folder in project bundle.';
export const projectBundleOverwriteConfirm:string='Some bundle content will overwrite existing, continue?';
export const projectBundleGetSettingsQues:string='Project bundle loaded, do you want to get helpful settings?';
// ** help related
export const helpFilename:string='helpfile.md';
export const helpFileLoadErr:string='** ERROR loading help file **';
// these are the keys which match the anchor links in the help file
export const helpBoardSupport:string='board-support';
export const helpLibsCopySupport:string='libs-copy-support';
export const helpFilesCopySupport:string='files-copy-support';
export const helpDriveMapping:string='cp-drive-mapping';
export const helpDownloading:string='board-downloading';
export const helpProjectTemplateSupport:string='project-template-support';
export const helpLibrarySupport:string='library-support';
export const helpProjectBundleSupport:string='project-bundle-support';
// do tooltips as a map from anchor keys
export const helpTooltipMap:Map<string,string>=new Map([
    [helpBoardSupport,'Help with Boards'],
    [helpLibsCopySupport,'Help with Lib copies'],
    [helpFilesCopySupport,'Help with File copies'],
    [helpDriveMapping,'Help with Drive Mapping'],
    [helpDownloading,'Help with Board Download'],
    [helpProjectTemplateSupport,'Help with Project Templates'],
    [helpLibrarySupport,'Help with Libraries'],
    [helpProjectBundleSupport,'Help with Project Bundle']
]);
