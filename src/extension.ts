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

    // Add fileTreeProvider to ensure proper disposal
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

        // Before saving the current selection to history, check if it's the same as the last selection
        const lastSelection = history[historyPosition] || [];
        if (!arraysEqual(checkedFiles, lastSelection)) {
          // Save the current selection to the history
          if (historyPosition < history.length - 1) {
            history = history.slice(0, historyPosition + 1);
          }
          history.push([...checkedFiles]); // Save a copy of the current selection
          historyPosition++;
        }

        const xmlOutput = await generateXmlOutput(checkedFiles);

        // Include system message if provided
        const config = vscode.workspace.getConfiguration("files2prompt");
        const systemMessage = config.get<string>("systemMessage");

        let finalOutput = xmlOutput;

        if (systemMessage && systemMessage.trim() !== "") {
          // Escape any ']]>' sequences in systemMessage
          const safeSystemMessage = systemMessage.replace(
            /]]>/g,
            "]]]]><![CDATA[>"
          );
          finalOutput =
            `<systemMessage>
<![CDATA[
${safeSystemMessage}
>
</systemMessage>
` + finalOutput;
        }

        // Copy to clipboard
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

          // Update the file selections in the FileTreeProvider
          await fileTreeProvider.setCheckedFiles(previousSelection);
        } else {
          // Show warning message
          vscode.window.showWarningMessage(
            "No previous selection to go back to."
          );
        }
      }),
      vscode.commands.registerCommand("files2prompt.goForward", async () => {
        if (historyPosition < history.length - 1) {
          historyPosition++;
          const nextSelection = history[historyPosition];

          // Update the file selections in the FileTreeProvider
          await fileTreeProvider.setCheckedFiles(nextSelection);
        } else {
          // Show warning message
          vscode.window.showWarningMessage(
            "No next selection to go forward to."
          );
        }
      }),
      vscode.commands.registerCommand("files2prompt.pasteXml", async () => {
        const clipboardContent = await vscode.env.clipboard.readText();
        await processXmlContent(clipboardContent);
      }),
      vscode.commands.registerCommand(
        "files2prompt.copyOpenFiles",
        async () => {
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
                  // Escape any ']]>' sequences in content
                  const safeContent = content.replace(
                    /]]>/g,
                    "]]]]><![CDATA[>"
                  );

                  const fileName = path.relative(
                    vscode.workspace.workspaceFolders![0].uri.fsPath,
                    filePath
                  );

                  xmlContent += `<file name="${fileName}">
<![CDATA[
${safeContent}
>
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

          // Copy to clipboard
          await vscode.env.clipboard.writeText(finalOutput);

          vscode.window.showInformationMessage(
            "Open file contents copied to clipboard."
          );
        }
      )
    );

    // Handle checkbox state changes asynchronously
    treeView.onDidChangeCheckboxState(async (e) => {
      for (const [item, state] of e.items) {
        await fileTreeProvider.updateCheckState(item, state);
      }
    });

    // Listen for configuration changes to update behavior dynamically
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

// Helper function to generate XML output
async function generateXmlOutput(filePaths: string[]): Promise<string> {
  let xmlContent = "";

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, "utf-8");
    // Escape any ']]>' sequences in file content
    const safeContent = content.replace(/]]>/g, "]]]]><![CDATA[>");

    const fileName = path.relative(
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      filePath
    );

    xmlContent += `<file name="${fileName}">
<![CDATA[
${safeContent}
>
</file>
`;
  }

  return `<files>
${xmlContent}</files>`;
}

// Helper function to compare arrays of strings
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

// Function to process XML content from clipboard
async function processXmlContent(xmlContent: string) {
  // Extract only XML content
  const xmlOnly = extractXmlContent(xmlContent);
  if (!xmlOnly) {
    vscode.window.showErrorMessage("No valid XML content found in clipboard.");
    return;
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    allowBooleanAttributes: true,
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: false,
    cdataPropName: "__cdata",
    tagValueProcessor: (val, tagName) => val, // Prevent default processing
  });

  let jsonObj;
  try {
    jsonObj = parser.parse(xmlOnly);
  } catch (error) {
    vscode.window.showErrorMessage("Error parsing XML content from clipboard.");
    return;
  }

  if (!jsonObj || !jsonObj.files || !jsonObj.files.file) {
    vscode.window.showErrorMessage("No <file> elements found in XML content.");
    return;
  }

  const files = Array.isArray(jsonObj.files.file)
    ? jsonObj.files.file
    : [jsonObj.files.file];

  for (const fileObj of files) {
    const fileName = fileObj["@_name"];
    let fileContent = "";

    if (fileObj["__cdata"]) {
      fileContent = fileObj["__cdata"];
    } else {
      // If no CDATA, get text content
      fileContent = fileObj["#text"] || "";
    }

    if (fileName) {
      const filePath = path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        fileName
      );
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, fileContent, "utf8");
    }
  }

  vscode.window.showInformationMessage("Files have been updated successfully.");
}

function extractXmlContent(text: string): string | null {
  const xmlMatch = text.match(/<files>[\s\S]*<\/files>/);
  if (xmlMatch) {
    return xmlMatch[0];
  }

  // If no <files> tag found, return null
  return null;
}
