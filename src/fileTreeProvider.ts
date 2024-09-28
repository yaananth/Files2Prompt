import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";

export class FileTreeProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | null | void
  > = new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FileItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private workspaceRoot: string;
  private checkedItems: Map<string, vscode.TreeItemCheckboxState> = new Map();
  private gitignore = ignore();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadGitignore();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  clearChecks(): void {
    this.checkedItems.clear();
    this.refresh();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
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
      const uri = vscode.Uri.file(fullPath);
      const isDirectory = entry.isDirectory();

      const isIgnored = this.isGitIgnored(relativePath);
      let checkboxState = this.checkedItems.get(fullPath);

      if (checkboxState === undefined) {
        checkboxState = vscode.TreeItemCheckboxState.Unchecked;
      }

      const item = new FileItem(
        entry.name,
        uri,
        isDirectory
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        isDirectory,
        checkboxState,
        isIgnored
      );

      items.push(item);
    }

    return items;
  }

  async updateCheckState(
    item: FileItem,
    state: vscode.TreeItemCheckboxState
  ): Promise<void> {
    const key = item.resourceUri.fsPath;
    this.checkedItems.set(key, state);

    if (item.isDirectory) {
      await this.updateDirectoryCheckState(key, state);
    } else {
      // If it's a file, update its parent directory's state
      const parentDir = path.dirname(key);
      await this.updateParentState(parentDir);
    }

    this.refresh();
  }

  // Make updateParentState async
  private async updateParentState(dirPath: string): Promise<void> {
    const parentKey = path.dirname(dirPath);
    const siblings = await fs.promises.readdir(dirPath);

    const allChecked = await Promise.all(
      siblings.map(async (sibling) => {
        const siblingPath = path.join(dirPath, sibling);
        const isIgnored = this.isGitIgnored(
          path.relative(this.workspaceRoot, siblingPath)
        );
        if (isIgnored) return true; // Ignore ignored files in parent state
        const state = this.checkedItems.get(siblingPath);
        return state === vscode.TreeItemCheckboxState.Checked;
      })
    ).then((results) => results.every((res) => res));

    if (allChecked) {
      this.checkedItems.set(dirPath, vscode.TreeItemCheckboxState.Checked);
      if (parentKey !== dirPath) {
        await this.updateParentState(parentKey);
      }
    } else {
      this.checkedItems.set(dirPath, vscode.TreeItemCheckboxState.Unchecked);
    }
  }

  private async updateDirectoryCheckState(
    dirPath: string,
    state: vscode.TreeItemCheckboxState
  ): Promise<void> {
    const dirEntries = await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    });

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);

      if (!this.isGitIgnored(relativePath)) {
        this.checkedItems.set(fullPath, state);

        if (entry.isDirectory()) {
          await this.updateDirectoryCheckState(fullPath, state);
        }
      } else {
        // For gitignored items, keep their current state or set to unchecked
        const currentState = this.checkedItems.get(fullPath);
        this.checkedItems.set(
          fullPath,
          currentState === vscode.TreeItemCheckboxState.Checked
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked
        );
      }
    }
  }

  getCheckedFiles(): string[] {
    return Array.from(this.checkedItems.entries())
      .filter(([_, state]) => state === vscode.TreeItemCheckboxState.Checked)
      .map(([path, _]) => path)
      .filter((path) => fs.statSync(path).isFile());
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

  private isGitIgnored(relativePath: string): boolean {
    return this.gitignore.ignores(relativePath);
  }
}

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly resourceUri: vscode.Uri,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public isDirectory: boolean,
    public checkboxState: vscode.TreeItemCheckboxState,
    public isGitIgnored: boolean
  ) {
    super(label, collapsibleState);

    this.tooltip = this.resourceUri.fsPath;
    this.iconPath = new vscode.ThemeIcon(this.isDirectory ? "folder" : "file");
    this.checkboxState = checkboxState;
  }
}
