/** 
 * Serial Interface Module
 * @module serialInterface
 */

import * as vscode from 'vscode';
import { REPL, FileOps, FileInfo } from './js/repl.js';
import { SerialPort } from 'serialport';
import { PortInfo } from '@serialport/bindings-cpp';
//import { SerialTerminal } from './serialTerminal';
import { serialTerminalSys } from './extension';
import * as path from 'path';
import * as strgs from './strings';

import { Mutex, MutexInterface, Semaphore, SemaphoreInterface, withTimeout } from 'async-mutex';

let replInstance: REPL = new REPL();

export function getReplInstance(): REPL {
	return replInstance;
}

/*
// ** need a resource lock for operations involving the repl
class ResourceLocker {
	private locked: boolean = false;
	private queue: (() => Promise<void>)[] = [];

	async acquireLock(callername:string): Promise<void> {
		if (this.locked) {
			console.log(`ResourceLocker: ${callername} waiting for lock`);
			return new Promise<void>(resolve => {
				this.queue.push(async () => { console.log(`ResourceLocker: ${callername} acquired lock`); resolve(); });
			});
		}
		console.log(`ResourceLocker: ${callername} acquired lock`);
		this.locked = true;
	}

	releaseLock(callername:string): void {
		console.log(`ResourceLocker: ${callername} released lock`);
		this.locked = false;
		if (this.queue.length > 0) {
			const next = this.queue.shift();
			if (next) {
				next();
			}
		}
	}
}
const resourceLocker = new ResourceLocker();
*/

// ** use mutex
// ** with timeout to prevent deadlock
const mutex = withTimeout(new Mutex(), 5000, new Error('Timeout waiting for access to device.'));

let port: SerialPort | undefined = undefined;
let activeSerialPort: serialPortInfo | undefined = undefined;
// ####MOVE to strings- ** NO, get from configuration- this is fallback default
const baudRateDflt: number = 115200;

// ** #157 - add status bar button to manage serial port connection, initially ready to connect
let serialPortButton:vscode.StatusBarItem | undefined=undefined;

export function initSerialStatusBarButton(context: vscode.ExtensionContext): void {
	serialPortButton=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,51);
	serialPortButton.command=strgs.cmdConnectSerialPortPKG;
	serialPortButton.text=strgs.serialPortButtonTextDisconnected;
	serialPortButton.tooltip=strgs.serialPortButtonTTDisconnected;
	if(isSerialPortDisabled()){
		serialPortButton.hide();
	}else{
		serialPortButton.show();
	}
	context.subscriptions.push(serialPortButton);
}

export function updateSerialStatusBarButton(): void {
	// ** logic is:
	// if serial port disabled in config, hide button
	// else if port active, show disconnect state
	// else show connect state
	if(!serialPortButton){ return; }
	if(isSerialPortDisabled()){
		serialPortButton.hide();
		return;
	}
	if(activeSerialPort){
		serialPortButton.command=strgs.cmdDisconnectSerialPortPKG;
		serialPortButton.text=strgs.serialPortButtonTextConnected;
		serialPortButton.tooltip=strgs.serialPortButtonTTConnected(activeSerialPort.portName);
	}else{
		serialPortButton.command=strgs.cmdConnectSerialPortPKG;
		serialPortButton.text=strgs.serialPortButtonTextDisconnected;
		serialPortButton.tooltip=strgs.serialPortButtonTTDisconnected;
	}
	serialPortButton.show();
}

export function getActiveSerialPort(): serialPortInfo | undefined {
	return activeSerialPort;
}

export interface serialPortInfo {
	portName: string;
	friendlyName: string;
}

interface portsPlus extends PortInfo {
	friendlyName?: string;
}


export async function listSerialPorts(): Promise<serialPortInfo[]> {
	try {
		const ports = await SerialPort.list();
		const portsPlus = ports as portsPlus[];
		// filter out ports with undefined in all of: friendlyName, manufacturer, serialNumber
		const filteredPorts = portsPlus.filter(port => port.friendlyName || port.manufacturer || port.serialNumber);
		const serialPortList = filteredPorts.map(port => {
			// find portname name from serMonList
			//const serMonPort = serMonList.find(p => p.portName === port.path);
			return {
				portName: port.path,
				friendlyName: (port.friendlyName || '') + ' ' + (port.manufacturer ? '(' + port.manufacturer + ')' : '')
			};
		});
		return serialPortList;
	} catch (error) {
		vscode.window.showErrorMessage(strgs.errorListingSerialPorts(error));
		return [];
	}
}

// ** connect to serial port
export function connectToSerialPort(selectedPort: serialPortInfo): void {
	// ???? should we check if a different port is already open and close it????
	// ** don't need to lock here since nothing else could run yet
	activeSerialPort = selectedPort;
	// try to close the vscode serial monitor if open on this port- DEPRECATED
	//serialTerminalSys.closeVscodeSerMon(activeSerialPort);
	// ** get the baud rate from configuration
	const baudRate=vscode.workspace.getConfiguration('circuitpythonsync').get<number>(strgs.confSerialBaudRatePKG,baudRateDflt);
	// create the port object
	port = new SerialPort({ path: activeSerialPort.portName, baudRate: baudRate, autoOpen: false });
	// wire up the repl to the transmit
	replInstance.serialTransmit = writeToPort;
	//wire up the read, will stay active as long as open - also hooks repl onSerialReceive
	readFromPort();
	// ** hook up the repl to write to the terminal
	replInstance.writeToTerminal = serialTerminalSys.writeToTerminal.bind(serialTerminalSys);
	// ** also register the terminal profile provider if not already done
	serialTerminalSys.registerToOpenTerminalFromProfile();
	//
	// ** now open the port
	openPort().then(() => {
		vscode.window.showInformationMessage(strgs.serialPortOpenedMessage(activeSerialPort ? activeSerialPort.portName : 'Unknown Port', baudRate));
	}).catch((err: any) => {
		vscode.window.showErrorMessage(strgs.errorSerialPortOpening(err));
		// ** clear active port and port object
		activeSerialPort = undefined;
		port = undefined;
	});
	updateSerialStatusBarButton();
}

export function disconnectSerialPort(): void {
	if (port && port.isOpen) {
		// ** #158- toggle dtr and rts to reset some boards on close
		port.set({ dtr: false, rts: false }, (err) => {
			if (err) {
				console.error('Error setting DTR/RTS on port close:', err);
				closePort().then(() => {
					vscode.window.showInformationMessage(strgs.serialPortClosedMessage(activeSerialPort ? activeSerialPort.portName : 'Unknown Port'));
					activeSerialPort = undefined;
					port = undefined;
					updateSerialStatusBarButton();
				}).catch((err: any) => {
					vscode.window.showErrorMessage(strgs.errorSerialPortClosing(err));
				});
			} else {
				// wait a bit and then set back
				setTimeout(() => {
					port?.set({ dtr: true, rts: true }, (err) => {
						if (err) {
							console.error('Error resetting DTR/RTS on port close:', err);
						}
						closePort().then(() => {
							vscode.window.showInformationMessage(strgs.serialPortClosedMessage(activeSerialPort ? activeSerialPort.portName : 'Unknown Port'));
							activeSerialPort = undefined;
							port = undefined;
							updateSerialStatusBarButton();
						}).catch((err: any) => {
							vscode.window.showErrorMessage(strgs.errorSerialPortClosing(err));
						});
					});
				}, 200);
			}
		});
		// closePort().then(() => {
		// 	vscode.window.showInformationMessage(strgs.serialPortClosedMessage(activeSerialPort ? activeSerialPort.portName : 'Unknown Port'));
		// 	activeSerialPort = undefined;
		// 	port = undefined;
		// }).catch((err: any) => {
		// 	vscode.window.showErrorMessage(strgs.errorSerialPortClosing(err));
		// });
	} else {
		activeSerialPort = undefined;
		port = undefined;
		updateSerialStatusBarButton();
	}
}

// ** async version of toggling dtr/rts
export async function toggleDtrRtsAsync(state: boolean): Promise<void> {
	return new Promise((resolve, reject) => {
		if (port && port.isOpen) {
			port.set({ dtr: state, rts: state }, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		} else {
			resolve();
		}
	});
}

// ** need async version of disconnect
export async function disconnectSerialPortAsync(): Promise<void> {
	if (port && port.isOpen) {
		// first try to toggle dtr/rts
		try {
			await toggleDtrRtsAsync(false);
			// wait a bit
			await new Promise(resolve => setTimeout(resolve, 200));
			await toggleDtrRtsAsync(true);
		} catch (err: any) {
			console.error('Error toggling DTR/RTS on port close:', err);
		}
		// now close the port
		try {
			await closePort();
			vscode.window.showInformationMessage(strgs.serialPortClosedMessage(activeSerialPort ? activeSerialPort.portName : 'Unknown Port'));
			activeSerialPort = undefined;
			port = undefined;
		} catch (err: any) {
			vscode.window.showErrorMessage(strgs.errorSerialPortClosing(err));
			activeSerialPort = undefined;
			port = undefined;
		}
	} else {
		activeSerialPort = undefined;
		port = undefined;
	}
}

async function readFromPort(): Promise<void> {
	if (port) {
		port.on('data', async (data) => {
			const strData = data.toString('utf8');
			// pass data to repl handler
			await replInstance.onSerialReceive({ data: strData });
			//console.log(`Data received: ${strData}`);
			// Process the incoming data as utf8 string
			//console.log(data.toString('utf8'));
			// ** write to output channel to show simulated repl data, or to terminal if active
			// ####TBD#### repl should handle this??????????????
			if (false) {
				// ** if no terminal, don't send
				serialTerminalSys.writeToTerminal(data.toString('utf8'));
			} else {
				//outputChannel.append(data.toString('utf8'));
				//outputChannel.show(true);
			}
		});
	}
}

// async function readFromPort(): Promise<void> {
//     parser.on('data', (data: string) => {
//         console.log(`Data received: ${data}`);
//     });
// }

export async function writeToPort(data: string): Promise<void> {
	// ** don't write if port not open to keep from stacking up response????
	return new Promise((resolve, reject) => {
		if (port && port.isOpen) {
			port.write(data, (err) => {
				if (err) {
					console.error('Error writing to port:', err);
					reject(err);
				} else {
					resolve();
				}
			});
		} else {
			resolve;
		}
	});
}

// awaitable serialport open
async function openPort(): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!port) {
			reject('No serial port selected');
			return;
		}
		port.open((err) => {
			if (err) {
				reject('Error opening port: ' + err.message);
			} else {
				resolve('');
			}
		});
	});
}

// awaitable serialport close
async function closePort(): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!port) {
			reject('No serial port selected');
			return;
		}
		port.close((err) => {
			if (err) {
				reject('Error closing port: ' + err.message);
			} else {
				resolve('');
			}
		});
	});
}

// ** soft reset the board via the repl
export async function softReset(): Promise<void> {
	//await resourceLocker.acquireLock(softReset.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			await replInstance.softRestart();
			//vscode.window.showInformationMessage('Soft reset command sent to board.');
		} catch (error) {
			//vscode.window.showErrorMessage(`Error sending soft reset command: ${error}`);
		} finally {
			release();
			//resourceLocker.releaseLock(softReset.name);
		}
	//});
}

// ** get the disabled state of serial port config
export function isSerialPortDisabled(): boolean {
	return vscode.workspace.getConfiguration().get<boolean>(`circuitpythonsync.${strgs.configDisableSerialPortKeyPKG}`, false);
}

// **** file operations

export interface serialEntry extends vscode.FileStat {
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	name: string;
}

// ** generally all the file operations should be locked to prevent conflicts
export async function statFile(filepath: string): Promise<serialEntry | undefined> {
	const fileOps = new FileOps(replInstance);
	const fname = path.basename(filepath);
	let dir = path.dirname(filepath);
	if (!dir.startsWith('/')) {
		dir = '/' + dir;
	}
	// ** if the root (dir='/' and fname='') then just return a default root entry
	if (dir === '/' && fname === '') {
		return {
			type: vscode.FileType.Directory,
			ctime: 0,
			mtime: 0,
			size: 0,
			name: '/'
		};
	}
	//await resourceLocker.acquireLock(statFile.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			const files = await fileOps.listDir(dir);
			for (const f of files) {
				if (f.path === fname) {
					return {
						type: f.isDir ? vscode.FileType.Directory : vscode.FileType.File,
						ctime: f.fileDate,
						mtime: f.fileDate,
						size: f.fileSize,
						name: f.path
					};
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(strgs.errorSerialStat(filepath,error));
		} finally {
			release();
			//resourceLocker.releaseLock(statFile.name);
		}
	//});
	return undefined;
}

export async function readDirectory(dirpath: string): Promise<serialEntry[]> {
	const fileOps = new FileOps(replInstance);
	//await resourceLocker.acquireLock(readDirectory.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			const files = await fileOps.listDir(dirpath.startsWith('/') ? dirpath : '/' + dirpath);
			return files.map(f => {
				return {
					type: f.isDir ? vscode.FileType.Directory : vscode.FileType.File,
					ctime: f.fileDate,
					mtime: f.fileDate,
					size: f.fileSize,
					name: f.path
				};
			});
		} catch (error) {
			vscode.window.showErrorMessage(strgs.errorSerialReadDir(dirpath,error));
			return [];
		} finally {
			release();
			//resourceLocker.releaseLock(readDirectory.name);
		}
	//});
	return [];
}

const textFileExtensions = strgs.serialInterfaceTextFileExtensions;

// read a file from the device
export async function readFile(filepath: string): Promise<Uint8Array | undefined> {
	const fileOps = new FileOps(replInstance);
	//await resourceLocker.acquireLock(readFile.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			let fileContent: string | Blob | null;
			if (textFileExtensions.some(ext => filepath.endsWith(ext))) {
				fileContent = await fileOps.readFile(filepath.startsWith('/') ? filepath : '/' + filepath);
			} else {
				// ** read as binary(raw)
				fileContent = await fileOps.readFile(filepath.startsWith('/') ? filepath : '/' + filepath, true);
			}
			// ** empty string here is ok, but not null or undefined
			if (fileContent===null || fileContent===undefined) { return undefined; }
			if (typeof fileContent === 'string') {
				// ** per the repl-file-transfer.js at 
				//  https://github.com/circuitpython/web-editor/blob/main/js/common/repl-file-transfer.js
				// replace any \r\n with just \n which is typical for text files on CP
				fileContent = fileContent.replace(/\r\n/g, '\n');
				// convert to Uint8Array
				return Buffer.from(fileContent, 'utf8');
			} else if (fileContent instanceof Blob) {
				return new Uint8Array(await fileContent.arrayBuffer());
			}
		} catch (error) {
			vscode.window.showErrorMessage(strgs.errorSerialReadFile(filepath,error));
			return undefined;
		} finally {
			release();
			//resourceLocker.releaseLock(readFile.name);
		}
	//});
	return undefined;
}

// write a file to the device
const largeFileSize = strgs.serialInterfaceLargeFileSizeKB * 1024; // 50KB
const largeFileSizeChunk = strgs.serialInterfaceLargeFileSizeChunksKB * 1024; // 32KB chunks
export async function writeFile(filepath: string, content: Uint8Array): Promise<void> {
	const fileOps = new FileOps(replInstance);
	//await resourceLocker.acquireLock(writeFile.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			const thisMtime = Date.now();
			// ** need to determine if filename is text, else treat as binary(raw)
			if (textFileExtensions.some(ext => filepath.endsWith(ext))) {
				// if(filepath.endsWith('.txt') || filepath.endsWith('.py') || filepath.endsWith('.md') 
				// 	|| filepath.endsWith('.json') || filepath.endsWith('.toml')) {
				await fileOps.writeFile(filepath.startsWith('/') ? filepath : '/' + filepath, content,0,thisMtime,false);
			} else {
				// ** if file > xxKB then need to chunk it and use offset
				if (content.length > largeFileSize) {
					const chunkSize = largeFileSizeChunk;
					let offset = 0;
					while (offset < content.length) {
						const end = Math.min(offset + chunkSize, content.length);
						const chunk = content.slice(offset, end);
						await fileOps.writeFile(filepath.startsWith('/') ? filepath : '/' + filepath, chunk, offset, thisMtime, true);
						offset = end;
					}
				} else {
					// ** write as binary(raw) in one shot
					await fileOps.writeFile(filepath.startsWith('/') ? filepath : '/' + filepath, content, 0, thisMtime, true);
				}
				//await fileOps.writeFile(filepath.startsWith('/') ? filepath : '/' + filepath, content,0,null,true);
			}
		} catch (error) {
			vscode.window.showErrorMessage(strgs.errorSerialWriteFile(filepath,error));
		} finally {
			release();
			//resourceLocker.releaseLock(writeFile.name);
		}
	//});
}

// delete a file on the device
export async function deleteFile(filepath: string): Promise<void> {
	const fileOps = new FileOps(replInstance);
	//await resourceLocker.acquireLock(deleteFile.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			await fileOps.delete(filepath.startsWith('/') ? filepath : '/' + filepath);
		} catch (error) {
			vscode.window.showErrorMessage(strgs.errorSerialDeleteFile(filepath,error));
		} finally {
			release();
			//resourceLocker.releaseLock(deleteFile.name);
		}
	//});
}

// create a directory on the device
export async function createDirectory(dirpath: string): Promise<void> {
	const fileOps = new FileOps(replInstance);
	//await resourceLocker.acquireLock(createDirectory.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			await fileOps.makeDir(dirpath.startsWith('/') ? dirpath : '/' + dirpath);
		} catch (error) {
			vscode.window.showErrorMessage(strgs.errorSerialCreateDir(dirpath,error));
		} finally {
			release();
			//resourceLocker.releaseLock(createDirectory.name);
		}
	//});
}

// rename a file or directory on the device - just use the repl move
export async function renameFile(oldPath: string, newPath: string): Promise<void> {
	const fileOps = new FileOps(replInstance);
	//await resourceLocker.acquireLock(renameFile.name);
	//await mutex.runExclusive(async () => {
	const release=await mutex.acquire();
		try {
			await fileOps.move(oldPath.startsWith('/') ? oldPath : '/' + oldPath, newPath.startsWith('/') ? newPath : '/' + newPath);
		} catch (error) {
			vscode.window.showErrorMessage(strgs.errorSerialRenameFile(oldPath,newPath,error));
		} finally {
			release();
			//resourceLocker.releaseLock(renameFile.name);
		}
	//});
}

// end of serialInterface.ts
// --------------------------------------------------