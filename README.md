# circuitpythonsync README

## Commands
* CP Copy
* CP Set Drive

## NOTE about mounting usb drives in linux
* for WSL pass thru drive, assuming it is D:, use:
`sudo mount -t drvfs D: /mnt/d -o uid=$(id -u $USER),gid=$(id -g $USER)`
  (or just use your username for the $() expressions)
* for actual usb block device (use lsblk to see actual dev point)
`sudo mount /dev/sda1 /media/CIRCUITPY -o uid=$(id -u $USER),gid=$(id -g $USER)`
  (or just use your username for the $() expressions)

## ISSUES-TODO
* if code.py not in root won't activate, but also won't if code.py added???

- test release 4a
- test release 4b
- test release 4c

- test no release
- test release 4d with empty tags
- test release 4f with all starting empty
- test release 4g by pushing tag first
- test release 4h after removing branch from workflow
- test push without a tag to make sure no action done
- test release v0.0.4k to create vsix 2
- test release v0.0.4m to create all targets
- test release v0.0.4n to create all after fix typo in workflow
- test release v0.0.4p to create release just once
- test release v0.0.4q with upload gh command fixed

### after adding special handling for arm64
- test release v0.0.5 with arm64 on linux build
- test release v0.0.5a with fixed aarch conditional steps
- test release v0.0.5b with expression all in braces
- test release v0.0.5c with fix to matrix property

### after addressing issues
- test release v0.0.6 for multi platform testing of issues fixes
- test release v0.0.6a to fix bug in checking drive map status
- test release v0.0.6b to fix remaining bug in button update re usb
- close #7 - finished testing 6b on all platforms

### new enhancements
- create release v0.0.7 for testing issue #10

### issue 11, library functionality
- create release v0.0.8 for testing on all platforms
- create release v0.0.8a for testing on all platforms, correct version in package

### issue 15, library manage
- create release v0.0.9 for testing all platforms because of file management
- create release v0.0.9a for testing on platforms after fixing cpfiles create bug
- release number didn't work, try v0.0.9-a

### issue 22, cpfiles issues
- create release v0.0.10 for testing on all platforms

### issue 19, add extension prefix in commands, extract string constants
- create release v0.0.11 for all platforms before actual copy actions

### issues 28 and 26, setup string constants file and do more checks on cpfiles
- create release v0.0.12 for all platform tests
- with merge to master create v0.0.13 as baseline for all platforms

### issue #27, board download
- create release v0.0.14 for platform tests, particularly windows

### issue #21- real copies
- create release v0.0.15 for platform tests

### issues #32 and #32 - scaffolding and download helper
- create release v0.0.16 for platform tests
- create release v0.0.16-a to debug issue on windows
- create release v0.0.16-b to try different method to access cptemplate
- create release v0.0.16-c to split cptemplate lines without CRs
- create release v0.0.16-d to clean up another split and remove diag info msgs

## Release 0.1.0
- create release v0.1.0 with all major functions

## issue #36, diffs and board explorer
- create release v0.1.0-a for platform testing

## issue #37, cp files and lib manager enhancments
- create release v0.1.1 for platform testing prior to PR

## issues #39 and 42, manage libraries and lib stubs
- create release v0.1.2 for platform testing prior to PR
- create release v0.1.2-c to correct package file names after fixing aarch64 gcc load

# Issue #43, manage stubs
- create release v0.1.3 for platform testing prior to PR into master

# Issue #48, migrate strings from lib and stubs updates
- create release v0.1.4 for baseline prior to PR to master

# Issue #51, board change not working on windows
- create release v0.1.4-a with fix to filter old board extra paths

# Issues #44, #50, #53, #55, fix bugs and clean up project startup seq
- create release v0.1.5 for platform testing.
- create release v0.1.5-a as baseline from fixing all listed bugs

# Issue #57, new setting for personal project template
- create release v0.1.6 for platform testing
- create release v0.1.7, adding full list management
- create baseline release v0.1.7-a before merge #57 to master

# Issues #60 and #65, implement proj bundle loader, fix lib loader match
- create release v0.1.8 for platform testing
- fix bug from 0.1.8 and add new mode to template load, v0.1.8-a
- add default proj template to use at end of bundle load, v0.1.8-b for testing before master merge.

# Issues #71, #73, #78, enhancements for lib/stubs, selecting libs, and alter default template
- create release v0.1.9 for platform testing
- fix bug in lib mgmt config spy to remove full cp version, release v0.1.9-a

# Issue #79 - add file upload option for project bundles
- create release v0.1.10 for platform testing

# Issues #70, #81, #85 - adding new template capabilities and fixes
- create release v0.1.11 for platform testing
- bug #86 found, board id not being read right, fixed in release v0.1.11-a


