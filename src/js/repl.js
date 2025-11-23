const CHAR_CTRL_A = '\x01';
const CHAR_CTRL_B = '\x02';
const CHAR_CTRL_C = '\x03';
const CHAR_CTRL_D = '\x04';
const CHAR_TITLE_START = "\x1b]0;";
const CHAR_TITLE_END = "\x1b\\";
const CHAR_SNAKE = "🐍";

const MODE_NORMAL = 1;
const MODE_RAW = 2;
const MODE_PRE_PROMPT = 3;

const TYPE_DIR = 16384;
const TYPE_FILE = 32768;
const DEBUG = false;

export const LINE_ENDING_CRLF = "\r\n";
export const LINE_ENDING_LF = "\n";

// Default timeouts in milliseconds (can be overridden with properties)
const PROMPT_TIMEOUT = 20000;
const CODE_EXECUTION_TIMEOUT = 15000;
const CODE_INTERRUPT_TIMEOUT = 5000;
const PROMPT_CHECK_INTERVAL = 50;

const REGEX_PROMPT_RAW_MODE = /raw REPL; CTRL-B to exit/;
const REGEX_PROMPT_NORMAL_MODE = />>> /;
const REGEX_PRE_PROMPT = /Press any key to enter the REPL./;

const modes = [
    "Unknown",
    "Normal",
    "Raw",
    "Pre-Prompt",
];

// *** troubleshooting sequence issues ***
const troubleShoot = false;
function tconsole_log(msg,...params) {
    if (troubleShoot) {
        console.log(msg,...params);
    }
}

// Class to use python code to get file information
// We want to do stuff like writing files, reading files, and listing files
export class FileOps {
    constructor(repl, checkReadOnly=true) {
        this._repl = repl;
        this._isReadOnly = null;
        this._doCheckReadOnly = checkReadOnly;
    }

    async _checkReadOnly() {
        if (!this._doCheckReadOnly) {
            return;
        }

        if (this._isReadOnly == null) {
            this._isReadOnly = await this.isReadOnly();
        }

        if (this._isReadOnly) {
            throw new Error("File System is Read Only. Try disabling or ejecting the drive.");
        }
    }

    async _checkReplErrors() {
        let error = this._repl.getErrorOutput();
        if (error) {
            console.error("Python Error - " + error.type + ": " + error.message);
            this._repl.writeErrorToTerminal(error.raw);
            if (error.type == "OSError" && error.errno == 30) {
                this._isReadOnly = true;
                // Throw an error if needed
                await this._checkReadOnly();
            }
        }

        return error;
    }

    // Write a file to the device path with contents beginning at offset. Modification time can be set and if raw is true, contents is written as binary
    async _writeRawFile(path, contents, offset=0, modificationTime=null) {
        let byteString = "";
        // Contents needs to be converted from a ArrayBuffer to a byte string
        let view = new Uint8Array(contents);
        for (let byte of view) {
            byteString += String.fromCharCode(byte);
        }
        contents = btoa(byteString);  // Convert binary string to base64

        let code = `
import os
import binascii
with open("${path}", "wb") as f:
    f.seek(${offset})
    byte_string = binascii.a2b_base64("${contents}")
    f.write(byte_string)
`;

        if (modificationTime) {
            modificationTime = Math.floor(modificationTime / 1000);
            code += `os.utime("${path}", (${modificationTime}, ${modificationTime}))\n`;
        }
        await this._repl.runCode(code);
    }

    async _writeTextFile(path, contents, offset=0, modificationTime=null) {
        // The contents needs to be converted from a UInt8Array to a string
        contents = String.fromCharCode.apply(null, contents);
        // Preserve slashes and slash chracters (must be first)
        contents = contents.replace(/\\/g, '\\\\');
        // Preserve quotes
        contents = contents.replace(/"/g, '\\"');

        let code = `
import os
with open("${path}", "w") as f:
    f.seek(${offset})
    f.write("""${contents}""")
`;

        if (modificationTime) {
            modificationTime = Math.floor(modificationTime / 1000);
            code += `os.utime("${path}", (${modificationTime}, ${modificationTime}))\n`;
        }
        await this._repl.runCode(code);
    }

    // Write a file to the device path with contents beginning at offset. Modification time can be set and if raw is true, contents is written as binary
    async writeFile(path, contents, offset=0, modificationTime=null, raw=false) {
        if (raw) {
            await this._writeRawFile(path, contents, offset, modificationTime);
        } else {
            await this._writeTextFile(path, contents, offset, modificationTime);
        }
    }

    async _readRawFile(path) {
        try {
            let code = `
import binascii
with open("${path}", "rb") as f:
    byte_string = f.read()
    print(binascii.b2a_base64(byte_string, False))
`;

            let result = await this._repl.runCode(code);
            if (await this._checkReplErrors()) {
                return null;
            }

            // strip the b, ending newline, and quotes from the beginning and end
            let sliceStart = result.indexOf("b'") + 2;
            let sliceEnd = result.lastIndexOf("'");
            result = result.slice(sliceStart, sliceEnd);

            // convert the base64 string to an ArrayBuffer. Each byte of the Array buffer is a byte of the file with a value between 0-255
            result = atob(result);  // Convert base64 to binary string
            let length = result.length;
            let buffer = new ArrayBuffer(length);
            let view = new Uint8Array(buffer);
            for (let i = 0; i < length; i++) {
                view[i] = result.charCodeAt(i);
            }

            result = new Blob([buffer]);
            return result;
        } catch(error) {
            return null;
        }
    }

    async _readTextFile(path) {
        try {
            // Read and print out the contents of the file within backtick delimiters
            let code = `
with open("${path}", "r") as f:
    print("\`" + f.read() + "\`")
`;
            let result = await this._repl.runCode(code);
            if (await this._checkReplErrors()) {
                return null;
            }

            // Strip down to code within first and last backtick delimiters
            let sliceStart = result.indexOf("`") + 1;
            let sliceEnd = result.lastIndexOf("`");
            result = result.slice(sliceStart, sliceEnd);

            return result;
        } catch(error) {
            return null;
        }
    }

    // Read a file from the device
    async readFile(path, raw=false) {
        let result;

        if (raw) {
            result = await this._readRawFile(path);
        } else {
            result = await this._readTextFile(path);
        }

        return result;
    }

    // List files using paste mode on the device returning the result as a javascript array
    // We need the file name, whether or not it is a directory, file size and file date
    async listDir(path) {
        // Mask sure path has a trailing slash
        if (path[path.length - 1] != "/") {
            path += "/";
        }

        let code = `
import os
import time
contents = os.listdir("${path}")
for item in contents:
    result = os.stat("${path}" + item)
    print(item, result[0], result[6], result[9])
`;
        const result = await this._repl.runCode(code);
        let contents = [];
        if (!result) {
            return contents;
        }
        for (let line of result.split("\n")) {
            if (line.length > 0) {
                let [name, isDir, fileSize, fileDate] = line.split(" ");
                contents.push({
                    path: name,
                    isDir: isDir == TYPE_DIR,
                    fileSize: parseInt(fileSize),
                    fileDate: parseInt(fileDate) * 1000,
                });
            }
        }
        return contents;
    }

    async isReadOnly() {
        // MicroPython doesn't have storage, but also doesn't have a CIRCUITPY drive
        let code = `
try:
    import storage
    print(storage.getmount("/").readonly)
except ImportError:
    print(False)
`;
        let result = await this._repl.runCode(code);
        let isReadOnly = result.match("True") != null;

        return isReadOnly;
    }

    async makeDir(path, modificationTime=null) {
        await this._checkReadOnly();
        let code = `
import os
os.mkdir("${path}")
`;
        if (modificationTime) {
            modificationTime = Math.floor(modificationTime / 1000);
            code += `os.utime("${path}", (${modificationTime}, ${modificationTime}))\n`;
        }
        await this._repl.runCode(code);
        await this._checkReplErrors();
    }

    async delete(path) {
        await this._checkReadOnly();
        let code = `
import os
stat = os.stat("${path}")
if stat[0] == ${TYPE_FILE}:
    os.remove("${path}")
else:
    os.rmdir("${path}")
`;
        await this._repl.runCode(code);
        await this._checkReplErrors();
    }

    async move(oldPath, newPath) {
        await this._checkReadOnly();
        // we need to check if the new path already exists
        // Return true on success and false on failure

        let code = `
import os
os.rename("${oldPath}", "${newPath}")
`;
        await this._repl.runCode(code);
        let error = await this._checkReplErrors();

        return !error;
    }
}

class InputBuffer {
    constructor() {
        this._buffer = "";
        this._pointer = 0;
        this.lineEnding = LINE_ENDING_CRLF;
    }

    append(data) {
        this._buffer += data;
    }

    get() {
        return this._buffer;
    }

    clear() {
        this._buffer = "";
        this._pointer = 0;
    }

    readLine(advancePointer = true) {
        let lines = this.getLines();
        if (this._buffer.slice(this._pointer).length == 0) {
            return null;
        }
        if (advancePointer) {
            this._pointer += lines[0].length + this.lineEnding.length;
        }
        return lines[0];
    }

    readLastLine() {
        let lines = this.getLines();
        if (this._buffer.slice(this._pointer).length == 0) {
            return null;
        }

        return lines[lines.length - 1];
    }

    getRemainingBuffer() {
        // Let the result contain a slice of the buffer from the pointer to the end
        let result = this._buffer.slice(this._pointer);
        // ####TEST#### try leaving the ok at end
        if(result.toLowerCase().endsWith("ok\r\n")){
            this._pointer += result.length - 4;
            tconsole_log('grb - ends with ok\\r\\n, new pointer:',this._pointer);
        } else if (result.toLowerCase().endsWith("ok\n")){
            this._pointer += result.length - 3;
            tconsole_log('grb - ends with ok\\n, new pointer:',this._pointer);
        } else if (result.toLowerCase().endsWith("ok")){
            this._pointer += result.length - 2;
            tconsole_log('grb - ends with ok, new pointer:',this._pointer);
        } else {
        this._pointer += result.length;
        }
        // ####TEST####
        return result;
    }

    readExactly(byteCount) {
        let bytes = this._buffer.slice(this._pointer, this._pointer + byteCount);
        this._pointer += byteCount;
        return bytes;
    }

    readUntil(value) {
        // Read bytes using until the value is found
        let currentOffset = this._pointer;
        let bytes = this.readExactly(1);
        let newByte = ' ';
        // Continue to read 1 byte at a time until the last x bytes match the value
        while (!bytes.match(value) && newByte.length > 0) {
            newByte = this.readExactly(1);
            bytes += newByte;
        }
        if (newByte.length == 0) {
            // Buffer end reached, reset the prompt check pointer to the end
            this._pointer = currentOffset;
            return false;
        }

        return true;
    }

    movePointer(offset) {
        if (offset < this._pointer) {
            return;
        } else if (offset > this._buffer.length) {
            offset = this._buffer.length;
        }
        this._pointer = offset;
    }

    getLines(allLines = false) {
        let buffer = this._buffer;
        if (!allLines) {
            buffer = buffer.slice(this._pointer);
        }
        return buffer.split(this.lineEnding);
    }

    getPointerPosition() {
        return this._pointer;
    }
}

export class REPL {
    constructor() {
        this._pythonCodeRunning = false;
        this._codeOutput = '';
        this._errorOutput = '';
        this._serialInputBuffer = new InputBuffer();
        this._checkingPrompt = false;
        this._titleMode = false;
        this.promptTimeout = PROMPT_TIMEOUT;
        this.promptCheckInterval = PROMPT_CHECK_INTERVAL;
        this.title = '';
        this.serialTransmit = null;
        this._inputLineEnding = LINE_ENDING_CRLF;   // The line ending the REPL returns
        this._outputLineEnding = LINE_ENDING_LF;     // The line ending for the code result
        this._tokenQueue = [];
        this._mode = null;
        this._codeCheckPointer = 0; // Used for looking at code output
        this._promptCheckPointer = 0; // Used for looking at prompt output/control characters
        this._checkpointCount = 0;
        this._rawByteCount = 0;
        this.terminalOutput = true;
    }

    //####TEST#### read input buffer
    getInputBuffer() {
        return this._serialInputBuffer.get();
    }

    //// Placeholder Functions ////
    setTitle(title, append=false) {
        return;
    }

    writeToTerminal(data) {
        return;
    }

    //// Utility Functions ////

    _writeToTerminal(data) {
        if (this.terminalOutput) {
            this.writeToTerminal(data);
        }
    }

    writeErrorToTerminal(data) {
        this.writeToTerminal(`\x1b[91m${data}\x1b[0m`);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _timeout(callback, ms) {
        return Promise.race([callback(), this._sleep(ms).then(() => {throw Error("Timed Out");})]);
    }

    _regexEscape(regexString) {
        return regexString.replace(/\\/, "\\\\");
    }

    // Split a string up by full title start and end character sequences
    _tokenize(string) {
        const tokenRegex = new RegExp("(" + this._regexEscape(CHAR_TITLE_START) + "|" + this._regexEscape(CHAR_TITLE_END) + ")", "gi");
        return string.split(tokenRegex);
    }

    // Check if a chunk of data has a partial title start/end character sequence at the end
    _hasPartialToken(chunk) {
        const partialToken = /\\x1b(?:\](?:0"?)?)?$/gi;
        return partialToken.test(chunk);
    }

    _parseTitleInfo(regex) {
        if (this.title) {
            let matches = this.title.match(regex);
            if (matches && matches.length >= 2) {
                return matches[1];
            }
        }

        return null;
    }

    async _detectCurrentMode() {
        // Go through the buffer and detect the last mode change
        let buffer = this._serialInputBuffer.get();

        const rawModRegex = new RegExp(REGEX_PROMPT_RAW_MODE, 'g');
        const normalModRegex = new RegExp(REGEX_PROMPT_NORMAL_MODE, 'g');
        const prePromptRegex = new RegExp(REGEX_PRE_PROMPT, 'g');

        let lastRawPosition = this._findLastRegexPosition(rawModRegex, buffer);
        let lastNormalPosition = this._findLastRegexPosition(normalModRegex, buffer);
        let lastPrePromptPosition = this._findLastRegexPosition(prePromptRegex, buffer);
        if (lastPrePromptPosition > lastNormalPosition && lastPrePromptPosition > lastRawPosition) {
            this._mode = MODE_PRE_PROMPT;
            if (DEBUG) {
                console.log("Pre-Prompt Detected");
            }
            this._serialInputBuffer.movePointer(lastPrePromptPosition);
            await this.serialTransmit(CHAR_CTRL_C);
            return;
        }

        if (lastRawPosition > lastNormalPosition) {
            this._mode = MODE_RAW;
            this._serialInputBuffer.movePointer(lastRawPosition);
        } else if (lastNormalPosition > lastRawPosition) {
            this._mode = MODE_NORMAL;
            this._serialInputBuffer.movePointer(lastNormalPosition);
        }

        // If no mode changes detected, we will assume normal mode with code running
        if (!this._mode) {
            if (DEBUG) {
                console.log("No mode detected. Restarting Device.");
            }
            await this.softRestart();
            await this.serialTransmit(CHAR_CTRL_C);
            await this._sleep(1000);
        }
    }

    _findLastRegexPosition(regex, str) {
        let match;
        let lastPosition = -1;

        // Reset regex.lastIndex to start from the end of the string
        regex.lastIndex = 0;
        // Using a loop to find all matches
        while ((match = regex.exec(str)) !== null) {
            lastPosition = match.index;
            // Move to the next position after the match
            regex.lastIndex = match.index + 1;
        }

        return lastPosition;
    }

    _lineIsPrompt(prompt_regex) {
        let currentLine = this._serialInputBuffer.readLastLine();
        if (!currentLine) {
            return false;
        }
        return currentLine.match(prompt_regex);
    }

    _currentLineIsNormalPrompt() {
        return this._lineIsPrompt(/>>> $/);
    }

    async _checkCodeRunning() {
        await this._detectCurrentMode();
        if (DEBUG) {
            console.log("Checking if code is running in " + modes[this._mode]);
        }
        if (this._mode == MODE_RAW) {
            // In raw mode, we simply need to look for OK
            // Then we should store the results in the code output

            // The next bytes should be 1 of the following:
            // We receive OK, followed by code output, followed by Ctrl-D, followed by error output, followed by Ctrl-D
            // or we receive an error message
            let bytes = this._serialInputBuffer.getRemainingBuffer();
            this._rawByteCount += bytes.length;
            tconsole_log('ccr - raw bytes cnt: ',this._rawByteCount);
            if (this._rawByteCount >= 2) {
                tconsole_log('%cccr- bytes beginning: (len='+ bytes.length.toString()+ ')','color:#ff0;','\r\n', (bytes.length>50 ? bytes.slice(0,48)+'...' : bytes),'\r\n');
                while (bytes.length > 0) {
                    if (this._checkpointCount == 0) {
                        if (bytes.slice(0, 2).match("OK")) {
                            tconsole_log('ccr- ckptcnt 0, ok found');
                            this._checkpointCount++;
                            bytes = bytes.slice(2);
                            tconsole_log('%cccr- bytes remaining: (len='+ bytes.length.toString()+ ')','color:#ff0;','\r\n', (bytes.length>50 ? bytes.slice(0,48)+'...' : bytes),'\r\n');
                        } else if (bytes.slice(0, 2).match("ra")) {
                            tconsole_log('ccr- ckptcnt 0, ra found -error');
                            if (DEBUG) {
                                console.log("Unexpected bytes encountered. " + bytes);
                            }
                            return;
                        } else {
                            console.error("Unexpected output in raw mode: " + bytes);
                            return;
                        }
                    } else {
                        //tconsole_log('ccr- ckptcnt>0: ',this._checkpointCount);
                        if (bytes.slice(0, 1).match(CHAR_CTRL_D)) {
                            tconsole_log('ccr- matched ctrl-d for chkptcnt:',this._checkpointCount);
                            this._checkpointCount++;
                            //console.log("Checkpoint Count: " + this._checkpointCount);
                        } else {
                            if (this._checkpointCount == 1) {
                                // *** if have ok was a dup, get rid of it
                                if (bytes.slice(0, 2).match("OK")) {
                                    tconsole_log('ccr- **DUP ok found, removing** for ckptcnt=1');
                                    bytes = bytes.slice(2);
                                    tconsole_log('%cccr- bytes remaining: (len='+ bytes.length.toString()+ ')','color:#ff0;','\r\n', (bytes.length>50 ? bytes.slice(0,48)+'...' : bytes),'\r\n');
                                }
                                // Code Output
                                this._codeOutput += bytes.slice(0, 1);
                                //tconsole_log('ccr- ckptcnt=1, new codeOutput: (len=',this._codeOutput.length,'):',this._codeOutput.length>25 ? this._codeOutput.slice(0,25)+'...' : this._codeOutput);
                                //console.log("Code Output: " + bytes.slice(0,1));
                            } else if (this._checkpointCount == 2) {
                                // Error Output
                                this._errorOutput += bytes.slice(0, 1);
                                tconsole_log('ccr- ckptcnt=2, new error output:',this._errorOutput);
                                //console.log("Error: " + bytes.slice(0,1));
                            } else if (this._checkpointCount >= 2) {
                                tconsole_log('ccr- ckptcnt done, ending running:',this._checkpointCount);
                                tconsole_log('%cccr- final code output:','color:#0f0;','\r\n', this._codeOutput);
                                // We're done
                                this._pythonCodeRunning = false;
                            }
                        }

                        bytes = bytes.slice(1); // Remove the first byte
                    }
                }
            }

            return;
        }

        // In normal mode, we need to look for the prompt
        if (!!this._currentLineIsNormalPrompt()) {
            tconsole_log('ccr- back at normal prompt, ending code running');
            if (DEBUG) {
                console.log("REPL at Normal Mode prompt");
            }
            this._pythonCodeRunning = false;
        } else {
            console.log("Normal Prompt not detected.");
        }
    }

    _decodeError(rawError) {
        // Errors are typically 3 lines long
        let errorLines = rawError.split(this._inputLineEnding);
        let error = {
            file: null,
            line: null,
            type: null,
            message: null,
            errno: null,
        };
        if (errorLines.length > 0) {
            error.file = errorLines[1].match(/File "(.*)"/)[1];
            error.line = parseInt(errorLines[1].match(/line (\d+)/)[1]);
            error.type = errorLines[2].match(/(.+?):/)[1];
            error.message = errorLines[2].match(/: (.+)$/)[1];
            if (error.type == "OSError") {
                error.errno = parseInt(error.message.match(/\[Errno (\d+)\]/)[1]);
                error.message = error.message.replace(/\[Errno \d+\] /, '');
            }
        }
        error.raw = rawError;
        return error;
    }

    async _readUntil(value, timeout=5000) {
        // Call readUntil in the SerialInputBuffer, but with a timeout wrapper
        try {
            await this._timeout(
                async () => {
                    while (!this._serialInputBuffer.readUntil(value)) {
                        await this._sleep(100);
                    }
                }, timeout
            );
        } catch (error) {
            return false;
        }

        return true;
    }

    async _waitForCodeExecution(codeTimeoutMs=CODE_EXECUTION_TIMEOUT) {
        // Wait for the code to finish running, so we can capture the output
        if (DEBUG) {
            console.log("Waiting for code execution");
        }
        if (codeTimeoutMs) {
            try {
                await this._timeout(
                    async () => {
                        while (this._pythonCodeRunning) {
                            await this._checkCodeRunning();
                            await this._sleep(100);
                        }
                    }, codeTimeoutMs
                );
            } catch (error) {
                console.error("Code timed out.");
            }
        } else {
            // Run without timeout
            while (this._pythonCodeRunning) {
                await this._sleep(100);
            }
        }
    }

    async _waitForModeChange(mode, keySequence=null) {
        if (DEBUG) {
            console.log("Waiting for mode change from " + modes[this._mode] + " to " + modes[mode]);
        }
        try {
            await this._timeout(
                async () => {
                    while (this._mode != mode) {
                        if (keySequence) {
                            await this.serialTransmit(keySequence);
                        }
                        await this._detectCurrentMode();
                        await this._sleep(250);
                    }
                }, 3000
            );
        } catch (error) {
            console.log("Awaiting mode change timed out.");
        }
    }

    // Raw mode allows code execution without echoing back to the terminal
    async _enterRawMode() {
        if (this._mode == MODE_RAW) {
            if (DEBUG) {
                console.log("Already in Raw Mode");
            }
            await this._exitRawMode();
        }
        await this._waitForModeChange(MODE_RAW, CHAR_CTRL_A);
    }

    async _exitRawMode() {
        if (this._mode != MODE_RAW) {
            return;
        }

        // Wait for >>> to be displayed
        await this._waitForModeChange(MODE_NORMAL, CHAR_CTRL_B);
    }

    async _processQueuedTokens() {
        if (this._processing) {
            return;
        }
        this._processing = true;
        while (this._tokenQueue.length) {
            await this._processToken(this._tokenQueue.shift());
        }
        this._processing = false;
    }

    // Handle Title setting and add to the serial input buffer
    async _processToken(token) {
        if (token == CHAR_TITLE_START) {
            this._titleMode = true;
            this._setTitle("");
        } else if (token == CHAR_TITLE_END) {
            this._titleMode = false;
        } else if (this._titleMode) {
            this._setTitle(token, true);

            // Fix duplicate Title charactes
            let snakeIndex = this.title.indexOf(CHAR_SNAKE);
            if (snakeIndex > -1) {
                this._setTitle(this.title.slice(snakeIndex));
            }
        }

        this._serialInputBuffer.append(token);
        this._writeToTerminal(token);
    }

    //// External Functions ////

    _setTitle(title, append=false) {
        if (append) {
            title = this.title + title;
        }

        this.title = title;

        this.setTitle(title, append);
    }

    async _serialTransmit(msg) {
        if (!this.serialTransmit) {
            console.error("Default serial transmit function called. Message: " + msg);
            throw new Error("REPL serialTransmit must be connected to an external transmit function");
        } else {
            console.log("Transmitting: " + msg);
            return await this.serialTransmit(msg);
        }
    }

    //// Public Functions ////

    async onSerialReceive(e) {
        // We tokenize the serial data to handle special character sequences (currently titles only)
        // We don't want to modify e.data, so we make a copy of it
        let data = e.data;

        // Prepend a partial token if it exists
        if (this._partialToken) {
            data = this._partialToken + data;
            this._partialToken = null;
        }

        // Tokenize the larger string and send to the parent
        let tokens = this._tokenize(data);

        // Remove any partial tokens and store for the next serial data receive
        if (tokens.length && this._hasPartialToken(tokens.slice(-1))) {
            this._partialToken = tokens.pop();
        }

        // Send only full tokens to the token queue
        for (let token of tokens) {
            this._tokenQueue.push(token);
        }
        await this._processQueuedTokens();
    }

    // Allows for supplied python code to be run on the device via the REPL in normal mode
    async runCode(code, codeTimeoutMs=CODE_EXECUTION_TIMEOUT, showOutput=false) {
        this.terminalOutput = DEBUG || showOutput;

        await this.getToPrompt();
        let result = await this.execRawMode(code + LINE_ENDING_LF, codeTimeoutMs);
        this.terminalOutput = true;
        return result;
    }

    async softRestart() {
        await this.serialTransmit(CHAR_CTRL_D);
    }

    async interruptCode() {
        if (DEBUG) {
            console.log("Interrupting code");
        }
        this._pythonCodeRunning = true;
        // Wait for code to be interrupted
        try {
            await this._timeout(
                async () => {
                    while (this._pythonCodeRunning) {
                        await this.serialTransmit(CHAR_CTRL_C);
                        await this._checkCodeRunning();
                        await this._sleep(200);
                    }
                }, CODE_INTERRUPT_TIMEOUT
            );
        } catch (error) {
            console.log("Awaiting code interruption timed out. Restarting device.");
            // Can't determine the state, so restart device
            await this.softRestart();
            await this.serialTransmit(CHAR_CTRL_C);
            return false;
        }

    }

    async waitForPrompt() {
        this._pythonCodeRunning = true;

        // Wait for a prompt
        try {
            await this._timeout(
                async () => {
                    while (this._pythonCodeRunning) {
                        await this.getToPrompt();
                        await this._sleep(100);
                    }
                }, this.promptTimeout
            );
        } catch (error) {
            console.error("Awaiting prompt timed out.");
            return false;
        }
        return true;
    }

    async getToPrompt() {
        // Attempt to figure out the current mode and change it if needed
        while (!this._mode) {
            await this._detectCurrentMode();
        }

        // these will exit Raw Paste Mode or Raw mode if needed, otherwise they do nothing
        await this._exitRawMode();

        // We use GetToPrompt to ensure we are at a known place before running code
        // This will get from Paste Mode or Running App to Normal Prompt
        await this.interruptCode();
    }

    async execRawMode(code) {
        await this._enterRawMode();
        if (this._readUntil(REGEX_PROMPT_RAW_MODE)) {
            this._readUntil(">"); // Read until we get to the prompt
        }

        await this.serialTransmit(code);
        // Execute the code
        await this.serialTransmit(CHAR_CTRL_D);
        this._checkpointCount = 0;
        this._rawByteCount = 0;
        this._pythonCodeRunning = true;
        this._codeOutput = '';
        this._errorOutput = '';
        await this._waitForCodeExecution();

        await this._exitRawMode();
        return this._codeOutput;
    }

    getCodeOutput() {
        return this._codeOutput;
    }

    getErrorOutput(raw = false) {
        if (raw) {
            return this._errorOutput;
        }
        if (!this._errorOutput) {
            return null;
        }

        return this._decodeError(this._errorOutput);
    }

    getVersion() {
        return this._parseTitleInfo(/\| REPL \| (.*)$/);
    }

    getIpAddress() {
        return this._parseTitleInfo(/((?:\d{1,3}\.){3}\d{1,3})/);
    }

    setLineEnding(lineEnding) {
        if (lineEnding != LINE_ENDING_CRLF && lineEnding != LINE_ENDING_LF) {
            throw new Error("Line ending expected to be either be LINE_ENDING_CRLF or LINE_ENDING_LF")
        }

        this._outputLineEnding = lineEnding;
    }
}
