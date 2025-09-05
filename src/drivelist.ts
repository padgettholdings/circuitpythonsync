/**
 * @module drivelist
 */

//import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as si from 'systeminformation';

// Need a cache of detected drives managed by the DriveList module
let detectedDrives: detectedDrive[] = [];

export interface detectedDrive {
    drvPath: string; // e.g., 'C:' or '/mnt/c'
    hasBootFile: boolean; // Indicates if the boot file exists in the drive
    volumeLabel: string; // Optional volume label for the drive, if applicable
    isRemovable: boolean; // Indicates if the drive is removable (like a USB drive)
}

export interface Mountpoint {
	path: string;
	label: string | null;
}

export interface Drive {
	description: string;
	device: string;
	devicePath: string | null;
    volumeLabel: string | null;
	isRemovable: boolean;
	isUSB: boolean | null;
	mountpoints: Mountpoint[];
}

async function getDiskInfo(): Promise<si.Systeminformation.BlockDevicesData[]> {
    let retval: si.Systeminformation.BlockDevicesData[] = [];
    try {
        const blockDevices = await si.blockDevices();
        retval = blockDevices; // save the block devices for later use
        /*
        const fsSize = await si.fsSize();
        const usbDevices = blockDevices.filter((device) => {
          // Filter for USB block devices
          return device.type === 'usb';  // (device.bus && device.bus.toLowerCase().includes('usb'));
        });
        */
        //console.log('USB Block Devices:', usbDevices);
        //console.log('Block devices:', blockDevices);
        //console.log('Filesystem sizes:', fsSize);
    } catch (error) {
        console.error('Error getting disk info:', error);
    }
    return retval;
}

function detectDrives(): detectedDrive[] {
    const drives: detectedDrive[] = [];
    // **If not windows just return empty array
    if (os.platform()=== 'win32') {
        try {
            for (const drvletter of ['D', 'E', 'F', 'G', 'H', 'I', 'J']) { // Add more drive letters as needed
                const drvpath = `${drvletter}:/`;
                if (fs.existsSync(drvpath)) {
                    const hasBootFile = fs.existsSync(`${drvpath}/boot_out.txt`); // Check for a specific file
                    drives.push({
                        drvPath: drvpath.replace(/\/$/, ''), // Ensure no trailing slash for consistency, e.g., 'D:' instead of 'D:/'
                        hasBootFile,
                        volumeLabel: '', // Optional, can be set if needed
                        isRemovable: false
                    });
                }
            }
        } catch (error) {
            console.error('Error detecting drives:', error);
            // Handle the error gracefully, return empty array or log as needed
            return []; // Return an empty array in case of any error during drive detection
        }
    }
    return drives;
}



export async function list():Promise<Drive[]>{
    let retval=[] as Drive[];
    //if (os.platform() === 'win32') {}
    // first try the win detected drives
    const _detectedDrives = detectDrives();
    let needMoreDetail = false;
    // if got drives, check to see if cache is set
    if(_detectedDrives.length > 0){
        // check if cache is set
        if(detectedDrives.length === 0){
            // if not init the cache from detected drives
            detectedDrives = _detectedDrives;
            // and mark it that we need details from systeminformation
            needMoreDetail = true;
        }
        for (const drv of _detectedDrives) {
            // see if drv exists in current detectedDrives array, if not add it
            const existingDrive = detectedDrives.find(d => d.drvPath === drv.drvPath);
            if (!existingDrive) {
                // New drive detected, add it to the array
                detectedDrives.push(drv);
                needMoreDetail = true; // Mark that we need more detail
            }
        }
        // now check to see if any drives have been removed from the detectedDrives array, if so remove them
        for (const drv of detectedDrives) {
            const existsInNewScan = _detectedDrives.find(d => d.drvPath === drv.drvPath);
            if (!existsInNewScan) {
                // Drive no longer exists in the new scan, remove it from the array
                detectedDrives = detectedDrives.filter(d => d.drvPath !== drv.drvPath);
                //needMoreDetail = true; // Mark that we need more detail
            }
        }
        if(needMoreDetail) {
            // Call systeminformation to get more details on the drives if needed
            let diskInfo = await getDiskInfo(); // Get the latest disk info
            // only types of disk or part are valid 
            // ** on mac need to include virtual type
            if(os.platform() === 'darwin'){
                diskInfo = diskInfo.filter(disk => disk.type && (disk.type.toLowerCase() === 'disk' || disk.type.toLowerCase() === 'part' || disk.type.toLowerCase() === 'virtual') && disk.mount);
            } else {
                diskInfo = diskInfo.filter(disk => disk.type && (disk.type.toLowerCase() === 'disk' || disk.type.toLowerCase() === 'part') && disk.mount); // Filter out invalid types
            }
            if (diskInfo && diskInfo.length > 0) {
                // Update the detected drives with more details from systeminformation
                for (const drv of detectedDrives) {
                    const disk = diskInfo.find(d => d.mount && d.mount.toLowerCase() === drv.drvPath.toLowerCase());
                    if (disk) {
                        drv.volumeLabel = disk.label || ''; // Set the volume label if available
                        drv.isRemovable = disk.removable; // Determine if it's removable based on bus type
                    }
                }
            }
        }
    } else {
        // did not get win drives, will just need to call systeminformation and copy to cache
        // clear the cache, will populate new
        detectedDrives = [];
        // Call systeminformation to get more details on the drives
        let diskInfo = await getDiskInfo(); // Get the latest disk info
        // only types of disk or part are valid
        // ** on mac need to include virtual type
        if(os.platform() === 'darwin'){
            diskInfo = diskInfo.filter(disk => disk.type && (disk.type.toLowerCase() === 'disk' || disk.type.toLowerCase() === 'part' || disk.type.toLowerCase() === 'virtual') && disk.mount);
        } else {
            diskInfo = diskInfo.filter(disk => disk.type && (disk.type.toLowerCase() === 'disk' || disk.type.toLowerCase() === 'part') && disk.mount);
        }
        if (diskInfo && diskInfo.length > 0) {
            // Update the detected drives with more details from systeminformation
            for (const disk of diskInfo) {
                // Check if the drive is already in the detectedDrives array
                const existingDrive = detectedDrives.find(d => d.drvPath && d.drvPath.toLowerCase() === disk.mount.toLowerCase());
                if (!existingDrive) {
                    const drive: detectedDrive = {
                        drvPath: disk.mount,
                        hasBootFile: false, // Set to false for now, can be updated later if needed
                        volumeLabel: disk.label || '', // Set the volume label if available
                        isRemovable: disk.removable // Determine if it's removable based on bus type
                    };
                    detectedDrives.push(drive);
                }
            }
        }
    }
    // now copy the detected drives to the retval array
    for (const drv of detectedDrives) {
        const drive: Drive = {
            description: drv.drvPath,
            device: drv.drvPath,
            devicePath: drv.drvPath,
            volumeLabel: drv.volumeLabel,
            isRemovable: drv.isRemovable,
            isUSB: null, // Set to null for now, can be updated later if needed
            mountpoints: [
                { path: drv.drvPath, label: drv.volumeLabel }
            ]
        };
        retval.push(drive);
    }
    return retval;
    }


