# Files2Prompt

Copy file contents in XML format for LLM prompts effortlessly.

## Features

- **Visual File Tree**: Browse and select files within your workspace using an intuitive tree view.
- **Selective Copying**: Easily choose which files to include in the copy operation with checkboxes.
- **XML Formatting**: Copies the content of selected files wrapped in XML `<file>` elements, ready for use in LLM prompts or other applications.
- **Custom System Message**: Optionally include a system message in your copied output, encapsulated within a `<systemMessage>` XML element.
- **Configurable Shortcuts**: Quickly refresh the file tree or copy files using customizable keyboard shortcuts.
- **Git Ignore Support**: Automatically ignores files and directories specified in your .gitignore.

## Installation

### Install from Marketplace:

1. Open VS Code.
2. Go to the Extensions view by clicking on the Extensions icon in the Activity Bar or pressing `Ctrl+Shift+X` (`Cmd+Shift+X` on macOS).
3. Search for "Files2Prompt".
4. Click Install.

### Install from VSIX:

1. Download the .vsix file from the releases page.
2. In VS Code, press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) to open the Command Palette.
3. Type `Extensions: Install from VSIX...` and select the command.
4. Browse to the downloaded .vsix file and install.

## Usage

### Open Files2Prompt View:

- Click on the Files2Prompt icon in the Activity Bar to open the Files2Prompt view.

### Select Files:

- Browse through your workspace's file tree.
- Check the boxes next to the files you want to copy.

### Copy Files:

- Click the Copy Files button in the view's title bar or use the keyboard shortcut:
  - Windows/Linux: `Ctrl+Alt+C`
  - macOS: `Cmd+Alt+C`

### Refresh File Tree:

- To refresh the file tree view, click the Refresh button or use the keyboard shortcut:
  - Windows/Linux: `Ctrl+Alt+R`
  - macOS: `Cmd+Alt+R`

### Include System Message:

1. Go to Settings (`Ctrl+,` or `Cmd+,` on macOS).
2. Navigate to Extensions > Files2Prompt.
3. Enter your custom system message in the System Message field.
4. When you copy files, this message will be included at the top of the XML output.

## Configuration

### Customizing Keyboard Shortcuts

You can customize the keyboard shortcuts for refreshing and copying files:

1. Open Keyboard Shortcuts:
   - Press `Ctrl+K Ctrl+S` (`Cmd+K Cmd+S` on macOS).
2. Search for "Files2Prompt: Refresh" and "Files2Prompt: Copy Files".
3. Click on the desired command and press the new key combination you wish to assign.

### Setting a Custom System Message

1. Open Settings:
   - Press `Ctrl+,` (`Cmd+,` on macOS).
2. Navigate to Extensions > Files2Prompt.
3. Enter your desired system message in the System Message field.
4. If left empty, no system message will be included in the copied output.

## Example Output

```xml
<systemMessage>
<![CDATA[
This is a custom system message for LLM prompts.
]]>
</systemMessage>
<files>
  <file name="src/extension.ts">
    <![CDATA[
    // File content here
    ]]>
  </file>
  <file name="README.md">
    <![CDATA[
    # Readme content here
    ]]>
  </file>
</files>
```
