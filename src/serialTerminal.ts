import * as vscode from 'vscode';
import { SerialMonitorApi, Version, getSerialMonitorApi } from '@microsoft/vscode-serial-monitor-api';
import { SerialPort } from 'serialport';
import * as serialInterface from './serialInterface';
import * as strgs from './strings';

// The name of the terminal that shows up in the instances
const terminalName = strgs.serialTerminalName;

export class SerialTerminal {
    private _context: vscode.ExtensionContext;
    private serMonApi: SerialMonitorApi | undefined = undefined;
    //private serialPortList: serialInterface.serialPortInfo[] = [];
    private activeSerialPort: serialInterface.serialPortInfo | undefined = undefined;
    private port: SerialPort | undefined = undefined;
    // add terminal- ###TEST### - just expose writer for testing
    private termWriteEmitter: vscode.EventEmitter<string>;
    private termCloseEmitter: vscode.EventEmitter<void>;
    //let terminal: vscode.Terminal | undefined = undefined;
    //private terminalVisible: boolean = false;
    private terminalActive: boolean = false;
    private terminalProfileSet: boolean = false;

    constructor(context: vscode.ExtensionContext)  {
        this._context = context;
        this.termWriteEmitter = new vscode.EventEmitter<string>();
        this.termCloseEmitter = new vscode.EventEmitter<void>();
        // command to open the CP sync terminal
        const openTerminalCmdId = strgs.cmdSerialTerminalOpenPKG;
        const openCPSyncTerminalCommand = vscode.commands.registerCommand(openTerminalCmdId, async () => {
            if (this.activeTerminalCount()===0) {
                this.spinUpTerminal();
                this.updateTerminalActive(false);
            } else {
                //terminal.show();
            }
        });
        context.subscriptions.push(openCPSyncTerminalCommand);

    }

    // ** public functions **
    // spin up terminal so can call when needed in case user closes
    // do not open another if already visible
    public spinUpTerminal(): void {
        if (this.activeTerminalCount()>=1) { return; }
        // create the pty
        let pty: vscode.Pseudoterminal = {
            onDidWrite: this.termWriteEmitter.event,
            open: () => {
                this.termWriteEmitter.fire(strgs.serialTerminalGreeting);
            },
            close: () => {
                // make same as term profile even though should not be opened if another is visible
                // find all terminals with this name, if none, set visible false
                //const terminals = vscode.window.terminals.filter(term => term.name === 'CP Sync Serial Monitor');
                if (this.activeTerminalCount() <= 1) {
                    //this.terminalVisible = false;
                    // if terminal was active can also close port
                    if (this.terminalActive) {
                        this.updateTerminalActive(false);
                        // ###TBD### shouldn't repl be in charge of port?
                        /*
                        if (this.activeSerialPort && port && port.isOpen) {
                            closePort().then(() => {
                                vscode.window.showInformationMessage(`Serial port ${this.activeSerialPort?.portName} closed due to terminal close.`);
                            }).catch((err: any) => {
                                vscode.window.showErrorMessage(`Error closing serial port: ${this.getErrorMessage(err)}`);
                            });
                        }
                        */
                    }
                }
            },
            handleInput: (data: string) => {
                serialInterface.writeToPort(data);
            }
        };
        const terminal = vscode.window.createTerminal({ name: terminalName, pty: pty });
        //terminalVisible = true;
        terminal.show();
        // if haven't registered profile, do so now
        if (!this.terminalProfileSet) {
            this.registerToOpenTerminalFromProfile();
            this.terminalProfileSet = true;
        }
    }

    // profile provider to create terminal from profile, only one, , actually just close if multiple
    public registerToOpenTerminalFromProfile(): void {
        // register the terminal profile provider ** if not already done
        if(this.terminalProfileSet) { return; }
        this._context.subscriptions.push(
            vscode.window.registerTerminalProfileProvider(strgs.serialTerminalProfileName,
                {
                    provideTerminalProfile: (token) => {
                        let pty: vscode.Pseudoterminal = {
                            onDidWrite: this.termWriteEmitter.event,
                            onDidClose: this.termCloseEmitter.event,
                            open: () => {
                                // find all terminals with this name
                                //const terminals = vscode.window.terminals.filter(term => term.name === 'CP Sync Serial Monitor');
                                if (this.activeTerminalCount() > 1) {
                                    this.termCloseEmitter.fire();
                                } else {
                                    this.termWriteEmitter.fire(strgs.serialTerminalGreeting);
                                }
                                //terminalVisible = true;
                            },
                            close: () => {
                                // find all terminals with this name, if none, set visible false
                                //const terminals = vscode.window.terminals.filter(term => term.name === 'CP Sync Serial Monitor');
                                if (this.activeTerminalCount() <= 1) {
                                    //terminalVisible = false;
                                    // if terminal was active can also close port
                                    if (this.terminalActive) {
                                        this.updateTerminalActive(false);
                                        // ###TBD### shouldn't repl be in charge of port?
                                        /*
                                        if (this.activeSerialPort && port && port.isOpen) {
                                            closePort().then(() => {
                                                vscode.window.showInformationMessage(`Serial port ${this.activeSerialPort?.portName} closed due to terminal close.`);
                                            }).catch((err: any) => {
                                                vscode.window.showErrorMessage(`Error closing serial port: ${this.getErrorMessage(err)}`);
                                            });
                                        }
                                        */
                                    }
                                }
                            },
                            handleInput: (data: string) => {
                                serialInterface.writeToPort(data);
                            }
                        };
                        return new vscode.TerminalProfile({
                            name: terminalName,
                            pty: pty
                        });
                    }

                }
            )
        );
        this.terminalProfileSet = true;
    }

    // write data to terminal if active
    public async writeToTerminal(data: string): Promise<void> {
        if (this.activeTerminalCount()>=1) {
            this.termWriteEmitter.fire(data);
        }
    }

    public async closeVscodeSerMon(activeSerialPort: serialInterface.serialPortInfo): Promise<void> {
        this.serMonApi = await getSerialMonitorApi(Version.latest, this._context);
        if (this.serMonApi && activeSerialPort) {
            try {
				await this.serMonApi.stopMonitoringPort(activeSerialPort.portName);
				//vscode.window.showInformationMessage('Serial port monitor closed successfully.');
			} catch (error) {
				vscode.window.showErrorMessage(strgs.errorSerialTerminalCloseVSCodeMonitor(this.getErrorMessage(error)));
			}

        }
    }

    // ** private functions **

    // determine if this serial terminal is active in the list of terminals
    // NOTE that the number of terminals depends on when the call is made
    private activeTerminalCount(): number {
        const terminals = vscode.window.terminals.filter(term => term.name === terminalName);
        return terminals.length;
    }

    // manage the terminal state, showing separators when transition state
    // *** this may not be needed if repl.js handles it
    private updateTerminalActive(_active: boolean): void {
        if (this.activeTerminalCount()>=1) {
            if (_active) {
                this.terminalActive = true;
                //terminal.show();
                //termWriteEmitter.fire('--- Terminal Connected ---\r\n');
            } else {
                this.terminalActive = false;
                //termWriteEmitter.fire('--- Terminal Disconnected ---\r\n');
            }
        }
    }


    // utility to get message from error
    private getErrorMessage(error: any): string {
        if (error instanceof Error) {
            return error.message;
        } else if (typeof error === 'string') {
            return error;
        } else {
            return 'An unknown error occurred';
        }
    }

}