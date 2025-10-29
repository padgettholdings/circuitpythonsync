import * as path from 'path';
import * as vscode from 'vscode';
import * as serialInterface from './serialInterface';
import * as strgs from './strings';

export class File implements vscode.FileStat {

	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	data?: Uint8Array;

    constructor(name: string, size?: number, ctime?: number, mtime?: number) {
		this.type = vscode.FileType.File;
		this.ctime = ctime || Date.now();
		this.mtime = mtime || Date.now();
		this.size = size || 0;
		this.name = name;
	}
}

export class Directory implements vscode.FileStat {

	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	entries: Map<string, File | Directory>;

    constructor(name: string, size?: number, ctime?: number, mtime?: number) {
		this.type = vscode.FileType.Directory;
		this.ctime = ctime || Date.now();
		this.mtime = mtime || Date.now();
		this.size = size || 0;
		this.name = name;
		this.entries = new Map();
	}
}

export type Entry = File | Directory;

export class SerialFileSysProvider implements vscode.FileSystemProvider {

    root = new Directory('');

	// --- manage file metadata

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		return await this._lookup(uri, false);
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const entry = await this._lookupAsDirectory(uri, false);
		const result: [string, vscode.FileType][] = [];
        // get directory contents of this directory
        const dirEntries = await serialInterface.readDirectory(uri.path);
        for (const entryObj of dirEntries) {
            result.push([entryObj.name, entryObj.type]);
        }
		// for (const [name, child] of entry.entries) {
		// 	result.push([name, child.type]);
		// }
		return result;
	}

	// --- manage file contents

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const entry = await this._lookupAsFile(uri, false);
        if(entry){
            const data=await serialInterface.readFile(uri.path);
            if (data) {
                return data;
            }
        }
		throw vscode.FileSystemError.FileNotFound();
	}

	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }= { create: true, overwrite: true }): Promise<void> {
        // don't need to parse path, just use serialInterface.writeFile that takes full path
        // but do verify is a file path not directory
		//const basename = path.posix.basename(uri.path);
		//const parent = await this._lookupParentDirectory(uri);
		let entry = await this._lookup(uri, true);    //need to know if file not there so silent
		if (entry instanceof Directory) {
			throw vscode.FileSystemError.FileIsADirectory(uri);
		}
		if (!entry && !options.create) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		if (entry && options.create && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(uri);
		}
        // ** now write to device
        try{
            await serialInterface.writeFile(uri.path, content);
        } catch(error) {
            throw vscode.FileSystemError.Unavailable(strgs.errSerialFileProvWritingFile(uri.path, error));
        }
        // ** fire events related to create/modify
		if (!entry) {
			//entry = new File(basename);
			//parent.entries.set(basename, entry);
			this._fireSoon({ type: vscode.FileChangeType.Created, uri });
		}
		// entry.mtime = Date.now();
		// entry.size = content.byteLength;
		// entry.data = content;
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
	}

    // ####TBD#### implement copy?????????????  probably not needed since only called for copy on device
    async copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		vscode.window.showInformationMessage(`Copy not implemented`);
	}
	// --- manage files/folders

	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		// ** the serial interface only has a move command, so use that in the serialInterface rename
		// but first check if newUri exists and if overwrite is false then error
		if (!options.overwrite && await this._lookup(newUri, true)) {
			throw vscode.FileSystemError.FileExists(newUri);
		}
		// will let the repl file system worry about validity of paths etc
		/*
		const entry = await this._lookup(oldUri, false);
		const oldParent = await this._lookupParentDirectory(oldUri);

		const newParent = await this._lookupParentDirectory(newUri);
		const newName = path.posix.basename(newUri.path);
        if(!oldParent || !newParent) {return;}
		oldParent.entries.delete(entry.name);
		entry.name = newName;
		newParent.entries.set(newName, entry);
		*/
		try {
			await serialInterface.renameFile(oldUri.path, newUri.path);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(strgs.errSerialFileProvRenamingFile(oldUri.path, newUri.path, error));
		}
		this._fireSoon(
			{ type: vscode.FileChangeType.Deleted, uri: oldUri },
			{ type: vscode.FileChangeType.Created, uri: newUri }
		);
	}

	async delete(uri: vscode.Uri): Promise<void> {
		// error if:
		// - uri doesn't exist
		// - uri is a directory
		// otherwise delete it
		const entry = await this._lookup(uri, true);
		if (!entry) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		// ** #150 - allow directory delete.
		// if (entry instanceof Directory) {
		// 	throw vscode.FileSystemError.FileIsADirectory(uri);
		// }
		// ** now delete from device
		try {
			await serialInterface.deleteFile(uri.path);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(strgs.errSerialFileProvDeletingFile(uri.path, error));
		}
		/*
		const basename = path.posix.basename(uri.path);
		const parent = await this._lookupAsDirectory(dirname, false);
        if(!parent) {return;}
		if (!parent.entries.has(basename)) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		parent.entries.delete(basename);
		parent.mtime = Date.now();
		parent.size -= 1;
		*/
		// just get the dirname for event
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { uri, type: vscode.FileChangeType.Deleted });
	}

	async createDirectory(uri: vscode.Uri): Promise<void> {
		// treat the uri as a full path to the new directory
		// error if:
		// - directory already exists
		const entry = await this._lookup(uri, true);
		if (entry) {
			throw vscode.FileSystemError.FileExists(uri);
		}
		// now let the serial interface create the directory
		try {
			await serialInterface.createDirectory(uri.path);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(strgs.errSerialFileProvCreatingDir(uri.path, error));
		}
		/*
		const basename = path.posix.basename(uri.path);
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		const parent = await this._lookupAsDirectory(dirname, false);

		const entry = new Directory(basename);
        if(!parent) {return;}
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		*/
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri });
	}

	// ** copy workspace folder to board - NOT part of FileSystemProvider interface but repl doesn't directly do folders
	// ** HOWEVER, it does depend on repl creating folder if needed when writing a file
	async copyFolder(wsFolder: vscode.Uri, boardFolder: vscode.Uri): Promise<void> {
		// get all files in the workspace folder
		const files = await vscode.workspace.fs.readDirectory(wsFolder);
		for (const [name, type] of files) {
			const srcUri = vscode.Uri.joinPath(wsFolder, name);
			const destUri = vscode.Uri.joinPath(boardFolder, name);
			if (type === vscode.FileType.Directory) {
				// if it's a directory, copy it recursively
				await this.copyFolder(srcUri, destUri);
			} else {
				// if it's a file, copy it- repl will create folder if needed when writing file
				try {
					const data = await vscode.workspace.fs.readFile(srcUri);
					await this.writeFile(destUri, data, { create: true, overwrite: true });
				} catch (error) {
					vscode.window.showErrorMessage(strgs.errSerialFileProvCopyingFile(srcUri.path, destUri.path, error));
				}
			}
		}
	}

    // --- lookup

	private async _lookup(uri: vscode.Uri, silent: false): Promise<Entry>;
	private async _lookup(uri: vscode.Uri, silent: boolean): Promise<Entry | undefined>;
	private async _lookup(uri: vscode.Uri, silent: boolean): Promise<Entry | undefined> {
        // don't need to recurse through path, just use serialInterface.statFile
        let entry: Entry | undefined;
        try {
            const serEntry=await serialInterface.statFile(uri.path);
            if(serEntry) {
                entry=this.convertEntry(serEntry);
            }
        } catch (error) {
            if (!silent) {
                throw vscode.FileSystemError.FileNotFound(uri);
            } else {
                return undefined;
            }
        }
        if (!entry && !silent) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        /*
		const parts = uri.path.split('/');
		let entry: Entry = this.root;
		for (const part of parts) {
			if (!part) {
				continue;
			}
			let child: Entry | undefined;
			if (entry instanceof Directory) {
				child = await serialInterface.statFile(entry.name); //entry.entries.get(part);
			}
			if (!child) {
				if (!silent) {
					throw vscode.FileSystemError.FileNotFound(uri);
				} else {
					return undefined;
				}
			}
			entry = child;
		}
        */
		return entry;
	}

	private async _lookupAsDirectory(uri: vscode.Uri, silent: boolean): Promise<Directory | undefined> {
		const entry = await this._lookup(uri, silent);
		if (entry instanceof Directory) {
			return entry;
		}
		throw vscode.FileSystemError.FileNotADirectory(uri);
	}

	private async _lookupAsFile(uri: vscode.Uri, silent: boolean): Promise<File | undefined> {
		const entry = await this._lookup(uri, silent);
		if (entry instanceof File) {
			return entry;
		}
		throw vscode.FileSystemError.FileIsADirectory(uri);
	}

	private async _lookupParentDirectory(uri: vscode.Uri): Promise<Directory | undefined> {
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		return await this._lookupAsDirectory(dirname, false);
	}

    // helper to convert serial interface entry to this provider entry
    private convertEntry(entry: serialInterface.serialEntry): Entry {
        if (entry.type === vscode.FileType.File) {
            return new File(entry.name, entry.size, entry.ctime, entry.mtime);
        } else if (entry.type === vscode.FileType.Directory) {
            return new Directory(entry.name, entry.size, entry.ctime, entry.mtime);
        }
        throw new Error(`Unknown entry type: ${entry.type}`);
    }

	// --- manage file events

	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private _bufferedEvents: vscode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timeout;

	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	watch(_resource: vscode.Uri): vscode.Disposable {
		// ignore, fires for all changes...
		return new vscode.Disposable(() => { });
	}

	private _fireSoon(...events: vscode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}

}