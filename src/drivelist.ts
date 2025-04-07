/**
 * @module drivelist
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

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
	isRemovable: boolean;
	isUSB: boolean | null;
	mountpoints: Mountpoint[];
}

export function list():Drive[]{
        let retval=[] as Drive[];
        if (os.platform() === 'win32') {}
        return retval;
    }


