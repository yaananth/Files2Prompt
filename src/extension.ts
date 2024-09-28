// src/extension.ts

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { FileTreeProvider, FileItem } from "./fileTreeProvider";

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (workspaceFolders) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const fileTreeProvider = new FileTreeProvider(workspaceRoot);

    vscode.window.registerTreeDataProvider("fileCopierView", fileTreeProvider);

    context.subscriptions.push(
      vscode.commands.registerCommand("fileCopier.refresh", () =>
        fileTreeProvider.refresh()
      ),
      vscode.commands.registerCommand("fileCopier.copyFiles", async () => {
        const checkedFiles = fileTreeProvider.getCheckedFiles();

        if (checkedFiles.length === 0) {
          vscode.window.showWarningMessage("No files selected.");
          return;
        }

        const xmlOutput = await generateXmlOutput(checkedFiles);

        // Include system message if provided
        const config = vscode.workspace.getConfiguration("fileCopier");
        const systemMessage = config.get<string>("systemMessage");

        let finalOutput = xmlOutput;

        if (systemMessage && systemMessage.trim() !== "") {
          finalOutput =
            `<systemMessage>\n${systemMessage}\n</systemMessage>\n` +
            finalOutput;
        }

        // Copy to clipboard
        await vscode.env.clipboard.writeText(finalOutput);

        vscode.window.showInformationMessage(
          "File contents copied to clipboard."
        );
      })
    );

    // Register a selection change listener
    vscode.window.onDidChangeTreeViewSelection((e) => {
      if (e.treeId === "fileCopierView") {
        e.selection.forEach((item) => {
          if (item instanceof FileItem) {
            fileTreeProvider.toggleCheck(item);
          }
        });
      }
    });
  } else {
    vscode.window.showInformationMessage(
      "Please open a workspace folder to use this extension."
    );
  }
}

export function deactivate() {}

// Helper function to generate XML output
async function generateXmlOutput(filePaths: string[]): Promise<string> {
  let xmlContent = "";

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, "utf-8");
    const fileName = path.relative(
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      filePath
    );

    xmlContent += `<file name="${fileName}">\n<![CDATA[\n${content}\n]]>\n</file>\n`;
  }

  return `<files>\n${xmlContent}</files>`;
}
