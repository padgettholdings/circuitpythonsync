# CircuitPythonSync VS Code Extension

CircuitPythonSync is a TypeScript-based VS Code extension that provides development tools for Adafruit's CircuitPython microcontroller framework. The extension enables developers to sync files and libraries from PC to CircuitPython boards, manage CircuitPython libraries, explore board contents, and scaffold new projects.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

- Bootstrap and build the repository:
  - `npm install` -- takes 2 minutes. NEVER CANCEL. Set timeout to 5+ minutes.
  - `npx eslint src/` -- lint source code only, takes ~5 seconds (avoids bundled dependency warnings)
  - `npm run webpack` -- development build, takes ~6 seconds  
  - `npm run vscode:prepublish` -- production build, takes ~15 seconds. NEVER CANCEL. Set timeout to 30+ minutes.
  - `npx vsce package` -- creates VSIX extension package, takes ~20 seconds. NEVER CANCEL. Set timeout to 60+ minutes.

- Test the extension:
  - `npm run test-compile` -- compiles tests but has known minizlib dependency issue (non-blocking)
  - Full VS Code extension testing requires VS Code installation with Extension Test Runner
  - Test files are located in `src/test/` directory
  - Manual testing requires loading extension in VS Code development window (F5 in VS Code)

## Validation

- Always run `npm run lint` before committing changes or the CI (.github/workflows/release.yml) will fail
- Always build with `npm run webpack` after making changes to verify compilation
- Manual validation requires VS Code with a CircuitPython project containing `code.py` or `main.py` files
- ALWAYS test extension functionality by installing the VSIX file in VS Code and exercising core features:
  - Board connection and drive mapping 
  - File sync to CircuitPython device
  - Library management and installation
  - Project template creation
- The extension activates on workspaces containing `code.py`, `main.py`, or `lib`/`Lib` folders

## Build System Details

- **Package Manager**: npm (version 10.8.2+)
- **Node.js**: Version 20.19.4+ required  
- **TypeScript**: Version 5.7.2+ for compilation
- **Bundler**: webpack 5.99.3+ for extension packaging
- **VS Code**: Extension targets VS Code 1.91.0+

## Key Dependencies and Issues

- **KNOWN WARNING**: `osx-temperature-sensor` dependency missing warning during webpack build - this is expected and non-critical
- **KNOWN ISSUE**: `npm run test-compile` fails due to minizlib TypeScript definitions conflict - use webpack builds instead
- **Extension Dependencies**: Requires `ms-python.python` and `ms-vscode.vscode-serial-monitor` extensions
- **External Dependencies**: systeminformation, axios, tar, zip-lib for core functionality

## Common Tasks

### Repository Structure
```
.
├── .devcontainer/          # VS Code development container config
├── .github/workflows/      # CI/CD pipeline (release.yml)
├── .vscode/               # VS Code project settings
├── dist/                  # Webpack build output
├── out/                   # TypeScript compilation output  
├── resources/             # Extension assets (images, help files)
├── src/                   # TypeScript source code
│   ├── extension.ts       # Main extension entry point
│   ├── boardFileExplorer.ts # Board file system browser
│   ├── libraryMgmt.ts     # CircuitPython library management
│   ├── projectBundle.ts   # Project template system
│   ├── strings.ts         # String constants
│   └── test/              # Extension tests
├── package.json           # Extension manifest and dependencies
├── tsconfig.json          # TypeScript configuration
├── webpack.config.js      # Webpack bundling configuration
└── eslint.config.mjs      # ESLint linting rules
```

### Development Workflow
1. `npm install` -- install dependencies (first time setup)
2. `npm run webpack-dev` -- start development build with watch mode
3. Press F5 in VS Code to launch Extension Development Host
4. Test extension functionality in the development window
5. `npx eslint src/` -- validate source code style before committing (avoid `npm run lint` which includes bundled files)
6. `npx vsce package` -- create VSIX for distribution testing

### CI/CD Pipeline
- Release workflow triggers on version tags (v*)
- Builds on Ubuntu with Node.js 20.x
- Creates GitHub release with generated VSIX artifact
- See `.github/workflows/release.yml` for complete pipeline

### Extension Commands
The extension provides these VS Code commands (see package.json):
- `circuitpythonsync.helloWorld` -- Welcome and Help
- `circuitpythonsync.button1` -- CP Copy Files to Board  
- `circuitpythonsync.button2` -- CP Copy Libs to Board
- `circuitpythonsync.opendir` -- CP Set Drive
- `circuitpythonsync.mngcplibs` -- CP Manage Libs Copy
- `circuitpythonsync.libupdate` -- CP Install or Update Libraries and Stubs
- `circuitpythonsync.selectboard` -- CP Select Board
- `circuitpythonsync.newproject` -- CP Make or Update Project from Templates
- `circuitpythonsync.loadProjectBundle` -- CP Load Project Bundle

### Important Files to Monitor
- `src/extension.ts` -- Main extension logic, command registration
- `src/strings.ts` -- All user-facing string constants
- `package.json` -- Extension manifest, commands, configuration schema
- `resources/helpfile.md` -- Complete user documentation
- Always check `src/strings.ts` when modifying user-facing messages
- Always update `package.json` when adding new commands or configuration options

### Build Timing Expectations
- `npm install` -- 2-3 minutes (network dependent). NEVER CANCEL.
- `npm run lint` -- 5-10 seconds  
- `npm run webpack` -- 6-8 seconds
- `npm run vscode:prepublish` -- 15-20 seconds. NEVER CANCEL. Set timeout to 30+ minutes.
- `npx vsce package` -- 20-30 seconds. NEVER CANCEL. Set timeout to 60+ minutes.

### Known Build Warnings (Safe to Ignore)
- `osx-temperature-sensor` module not found -- optional macOS dependency
- webpack deprecation warnings -- related to older plugins, functionality unaffected
- minizlib TypeScript definition conflicts -- affects test compilation only, not runtime
- ESLint warnings in `dist/extension.js` -- these are from bundled dependencies, not source code
- Large number of ESLint warnings (~5000) when linting dist files -- expected from third-party bundled code

### Manual Validation Scenarios
ALWAYS test extension functionality after changes by:
1. Building the extension: `npm run vscode:prepublish && npx vsce package`
2. Installing the VSIX in VS Code: Extensions > Install from VSIX > select `circuitpythonsync-*.vsix`
3. Creating a test CircuitPython project:
   ```
   mkdir test-cp-project && cd test-cp-project
   echo 'print("Hello CircuitPython!")' > code.py
   mkdir lib
   ```
4. Opening the test project in VS Code and verifying:
   - Extension activates (Board Explorer appears in sidebar)
   - Help command works: Ctrl+Shift+P > "CircuitPythonSync: Welcome and Help"
   - Core commands are available in Command Palette
   - Extension settings appear in VS Code settings under "CircuitPython Sync"

### Development Tips
- Use `npm run webpack-dev` for active development with file watching
- Extension source maps are available for debugging in VS Code
- Check `resources/helpfile.md` for complete user-facing documentation
- All user-facing strings should be defined in `src/strings.ts`
- Extension settings schema is defined in `package.json` under `configuration`