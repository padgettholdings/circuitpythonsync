

export const cpfiles:string= 'cpfiles.txt';
export const cpfilesbak:string= 'cpfiles.bak';
export const noWriteCpfile:string = `Could not write ${cpfiles}`;
export const mngLibChooseLibs:string = `Choose Libraries for ${cpfiles}`;
export const noCodeFilesInCp:string =`No code files included in ${cpfiles} mapping, so only code.py or main.py will be copied.  Would you like to edit?`;
export const mngLibChecks:string = 'Check or uncheck desired files and folders';
/*
CPCopy
CPLib
**MUST MAP DRIVE FIRST**
**NO FILES EXIST THAT ARE TO BE COPIED**
boot_out.txt
**NOTE that boot_out.txt not found**
Enabled to copy to '+curDriveSetting
Can copy to '+curDriveSetting + ' BUT not USB drive!
circuitpythonsync.helloWorld
circuitpythonsync.button1
circuitpythonsync.button2
!! Must have open workspace !!
!! Must set drive before copy !!
!! No files specified to copy exist !!
!! No libraries specified to copy exist !!
WARNING! Entire lib folder will be copied, continue?
circuitpythonsync.mngcpfiles
!! No libraries yet created !
Destination mappings will be deleted, continue?
No lib folders/files selected, entire lib folder will be copied, continue?
Found a potential CircuitPython Board on drive: "'+connectDrvPath+'".  Do you want to map it?
circuitpythonsync.opendir
Pick Manually
Auto Detected
Auto Detected but NOT USB
Error listing drives:
Pick detected drive or select manually
CP Drive Select
Pick drive or mount point for CP
circuitpythonsync.drivepath
statusBarItem.warningBackground
*/
