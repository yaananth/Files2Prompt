// src/fileTreeProvider.ts

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import ignore from "ignore";

export class FileTreeProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | null | void
  > = new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FileItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private workspaceRoot: string;
  private checkedItems: Set<string> = new Set();
  private gitignore = ignore();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadGitignore();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    // Update checkbox state
    element.checkboxState = this.checkedItems.has(element.resourceUri.fsPath)
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    return element;
  }

  async getChildren(element?: FileItem): Promise<FileItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage("No workspace folder found.");
      return [];
    }

    const dirPath = element ? element.resourceUri.fsPath : this.workspaceRoot;
    return this.getFilesAndDirectories(dirPath);
  }

  private async getFilesAndDirectories(dirPath: string): Promise<FileItem[]> {
    const items: FileItem[] = [];
    const dirEntries = await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    });

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);

      // Check if the file is gitignored
      const isIgnored = this.gitignore.ignores(relativePath);

      const uri = vscode.Uri.file(fullPath);
      const isDirectory = entry.isDirectory();

      const isChecked = this.checkedItems.has(fullPath);
      const item = new FileItem(
        entry.name,
        uri,
        isDirectory
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        isDirectory,
        isChecked
      );

      items.push(item);
    }

    return items;
  }

  toggleCheck(item: FileItem): void {
    const key = item.resourceUri.fsPath;
    const relativePath = path.relative(this.workspaceRoot, key);
    const isIgnored = this.gitignore.ignores(relativePath);

    if (this.checkedItems.has(key)) {
      this.checkedItems.delete(key);
    } else {
      if (!isIgnored) {
        this.checkedItems.add(key);
      } else {
        vscode.window.showInformationMessage(
          `File "${item.label}" is gitignored and not checked by default. You can manually check it if needed.`
        );
        this.checkedItems.add(key);
      }
    }

    // If it's a directory, toggle all children recursively
    if (item.isDirectory) {
      this.toggleDirectory(key, this.checkedItems.has(key));
    }

    this.refresh();
  }

  private async toggleDirectory(
    dirPath: string,
    check: boolean
  ): Promise<void> {
    const relativeDirPath = path.relative(this.workspaceRoot, dirPath);
    const isDirIgnored = this.gitignore.ignores(relativeDirPath);

    if (isDirIgnored) {
      if (!check) {
        // If unchecking, remove from checkedItems
        this.checkedItems.delete(dirPath);
        // Continue to uncheck any previously checked children
      } else {
        // If checking, but directory is gitignored, do not add it or its children
        return;
      }
    } else {
      if (check) {
        // Add directory to checkedItems
        this.checkedItems.add(dirPath);
      } else {
        this.checkedItems.delete(dirPath);
      }
    }

    const dirEntries = await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    });

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);
      const isIgnored = this.gitignore.ignores(relativePath);

      if (entry.isDirectory()) {
        await this.toggleDirectory(fullPath, check);
      } else {
        if (isIgnored) {
          if (!check) {
            // Remove from checkedItems when unchecking
            this.checkedItems.delete(fullPath);
          }
          // Do not add when checking
        } else {
          if (check) {
            this.checkedItems.add(fullPath);
          } else {
            this.checkedItems.delete(fullPath);
          }
        }
      }
    }
  }

  getCheckedFiles(): string[] {
    return Array.from(this.checkedItems).filter((filePath) => {
      const stat = fs.statSync(filePath);
      return stat.isFile();
    });
  }

  private loadGitignore() {
    const gitignorePath = path.join(this.workspaceRoot, ".gitignore");

    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      this.gitignore = ignore().add(gitignoreContent);
    } else {
      this.gitignore = ignore();
    }
  }
}

export class FileItem extends vscode.TreeItem {
  public checkboxState: vscode.TreeItemCheckboxState;

  constructor(
    public readonly label: string,
    public readonly resourceUri: vscode.Uri,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public isDirectory: boolean,
    public checked: boolean
  ) {
    super(label, collapsibleState);

    this.tooltip = this.resourceUri.fsPath;

    this.command = {
      command: "fileCopier.toggleCheck",
      title: "",
      arguments: [this],
    };

    // Set icon
    this.iconPath = new vscode.ThemeIcon(this.isDirectory ? "folder" : "file");

    // Handle checkboxes
    this.checkboxState = checked
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
  }
}
