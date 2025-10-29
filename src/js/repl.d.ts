
export interface ReplError {
    file: string | null;
    line: number | null;
    type: string | null;
    message: string | null;
    errno: number | null;
    raw: string;
}

export class REPL {
    constructor();
    serialTransmit: ((msg: string) => Promise<unknown>) | null;
    runCode(code: string, codeTimeoutMs?: number, showOutput?: boolean): Promise<string>;
    softRestart(): Promise<void>;
    interruptCode(): Promise<boolean>;
    waitForPrompt(): Promise<boolean>;
    getToPrompt(): Promise<void>;
    execRawMode(code: string): Promise<string>;
    getCodeOutput(): string;
    getErrorOutput(raw?: boolean): ReplError | null;
    getVersion(): string | null;
    getIpAddress(): string | null;
    setLineEnding(lineEnding: string): void;
    onSerialReceive(e: { data: string }): Promise<void>;
    writeToTerminal: ((msg: string) => void) | null;
    //####TEST#### read input buffer
    getInputBuffer(): string;
}

export interface FileInfo {
    path: string;
    isDir: boolean;
    fileSize: number;
    fileDate: number;
}

export class FileOps {
    constructor(repl: REPL, checkReadOnly?: boolean);
    writeFile(path: string, contents: Uint8Array | ArrayBuffer, offset?: number, modificationTime?: number | null, raw?: boolean): Promise<void>;
    readFile(path: string, raw?: boolean): Promise<string | Blob | null>;
    listDir(path: string): Promise<FileInfo[]>;
    isReadOnly(): Promise<boolean>;
    makeDir(path: string, modificationTime?: number | null): Promise<void>;
    delete(path: string): Promise<void>;
    move(oldPath: string, newPath: string): Promise<boolean>;
}

export const LINE_ENDING_CRLF: string;
export const LINE_ENDING_LF: string;
