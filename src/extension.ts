import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { FileTreeProvider } from "./fileTreeProvider";
import { XMLParser } from "fast-xml-parser";

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (workspaceFolders) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const fileTreeProvider = new FileTreeProvider(workspaceRoot);

    const treeView = vscode.window.createTreeView("files2PromptView", {
      treeDataProvider: fileTreeProvider,
      manageCheckboxStateManually: true,
    });

    context.subscriptions.push(fileTreeProvider);

    let history: string[][] = [];
    let historyPosition: number = -1;

    context.subscriptions.push(
      vscode.commands.registerCommand("files2prompt.refresh", () =>
        fileTreeProvider.refresh()
      ),
      vscode.commands.registerCommand("files2prompt.copyFiles", async () => {
        const checkedFiles = fileTreeProvider.getCheckedFiles();

        if (checkedFiles.length === 0) {
          vscode.window.showWarningMessage("No files selected.");
          return;
        }

        const lastSelection = history[historyPosition] || [];
        if (!arraysEqual(checkedFiles, lastSelection)) {
          if (historyPosition < history.length - 1) {
            history = history.slice(0, historyPosition + 1);
          }
          history.push([...checkedFiles]);
          historyPosition++;
        }

        const xmlOutput = await generateXmlOutput(checkedFiles);

        const config = vscode.workspace.getConfiguration("files2prompt");
        const systemMessage = config.get<string>("systemMessage");

        let finalOutput = xmlOutput;

        if (systemMessage && systemMessage.trim() !== "") {
          finalOutput =
            `<systemMessage>
<![CDATA[
${systemMessage}
]]>
</systemMessage>
` + finalOutput;
        }

        await vscode.env.clipboard.writeText(finalOutput);

        vscode.window.showInformationMessage(
          "File contents copied to clipboard."
        );
      }),
      vscode.commands.registerCommand("files2prompt.clearChecks", () => {
        fileTreeProvider.clearChecks();
        vscode.window.showInformationMessage("All checks have been cleared.");
      }),
      vscode.commands.registerCommand("files2prompt.goBack", async () => {
        if (historyPosition > 0) {
          historyPosition--;
          const previousSelection = history[historyPosition];
          await fileTreeProvider.setCheckedFiles(previousSelection);
        } else {
          vscode.window.showWarningMessage(
            "No previous selection to go back to."
          );
        }
      }),
      vscode.commands.registerCommand("files2prompt.goForward", async () => {
        if (historyPosition < history.length - 1) {
          historyPosition++;
          const nextSelection = history[historyPosition];
          await fileTreeProvider.setCheckedFiles(nextSelection);
        } else {
          vscode.window.showWarningMessage(
            "No next selection to go forward to."
          );
        }
      }),
      vscode.commands.registerCommand("files2prompt.pasteXml", async () => {
        const clipboardContent = await vscode.env.clipboard.readText();
        await processXmlContent(clipboardContent);
      }),
      vscode.commands.registerCommand("files2prompt.copyOpenFiles", async () => {
        const tabGroups: ReadonlyArray<vscode.TabGroup> =
          vscode.window.tabGroups.all;

        let xmlContent = "";

        for (const group of tabGroups) {
          for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText) {
              const fileUri = tab.input.uri;
              const filePath = fileUri.fsPath;
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf-8");

                const fileName = path.relative(
                  vscode.workspace.workspaceFolders![0].uri.fsPath,
                  filePath
                );

                xmlContent += `<file name="${fileName}">
<![CDATA[
${content}
]]>
</file>
`;
              }
            }
          }
        }

        if (xmlContent === "") {
          vscode.window.showWarningMessage("No open files to copy.");
          return;
        }

        const finalOutput = `<files>
${xmlContent}</files>`;

        await vscode.env.clipboard.writeText(finalOutput);
        vscode.window.showInformationMessage(
          "Open file contents copied to clipboard."
        );
      })
    );

    treeView.onDidChangeCheckboxState(async (e) => {
      for (const [item, state] of e.items) {
        await fileTreeProvider.updateCheckState(item, state);
      }
    });

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("files2prompt.systemMessage")) {
          // Handle any dynamic updates if necessary
        }
      })
    );
  } else {
    vscode.window.showInformationMessage(
      "Please open a workspace folder to use this extension."
    );
  }
}

export function deactivate() { }

async function generateXmlOutput(filePaths: string[]): Promise<string> {
  let xmlContent = "";

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, "utf-8");
    const fileName = path.relative(
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      filePath
    );

    xmlContent += `<file name="${fileName}">
<![CDATA[
${content}
]]>
</file>
`;
  }

  return `<files>
${xmlContent}</files>`;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

async function processXmlContent(xmlContent: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: "__cdata",
    trimValues: false
  });

  let jsonObj;
  try {
    jsonObj = parser.parse(xmlContent);
  } catch (error) {
    vscode.window.showErrorMessage("Error parsing XML content from clipboard.");
    return;
  }

  if (!jsonObj || !jsonObj.files || !jsonObj.files.file) {
    vscode.window.showErrorMessage("No file content found. See documentation for usage.");
    return;
  }

  const files = Array.isArray(jsonObj.files.file)
    ? jsonObj.files.file
    : [jsonObj.files.file];

  const changedFiles: string[] = [];
  const newFiles: string[] = [];
  
  for (const fileObj of files) {
    const fileName = fileObj["@_name"];
    let fileContent = "";

    if (fileObj["__cdata"]) {
      fileContent = fileObj["__cdata"];
    } else {
      fileContent = fileObj["#text"] || "";
    }

    if (fileName) {
      const filePath = path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        fileName
      );
      
      // Check if file exists before writing
      const fileExists = fs.existsSync(filePath);
      
      // Create directory if needed
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      
      // If file exists, check if content is different
      if (fileExists) {
        const existingContent = await fs.promises.readFile(filePath, 'utf8');
        if (existingContent !== fileContent) {
          await fs.promises.writeFile(filePath, fileContent, "utf8");
          changedFiles.push(fileName);
        }
      } else {
        await fs.promises.writeFile(filePath, fileContent, "utf8");
        newFiles.push(fileName);
      }
    }
  }

  // Create detailed message about changes
  let message = '';
  if (changedFiles.length > 0) {
    message += `Modified files:\n${changedFiles.join('\n')}\n\n`;
  }
  if (newFiles.length > 0) {
    message += `New files:\n${newFiles.join('\n')}`;
  }

  if (message) {
    // Show information message with option to view details
    vscode.window.showInformationMessage(
      `Files have been updated successfully. ${changedFiles.length} modified, ${newFiles.length} new.`,
      'Show Details'
    ).then(selection => {
      if (selection === 'Show Details') {
        // Create and show output channel with details
        const channel = vscode.window.createOutputChannel('Files2Prompt Changes');
        channel.clear();
        channel.appendLine(message);
        channel.show();
      }
    });
  } else {
    vscode.window.showInformationMessage('No files were changed.');
  }
}
