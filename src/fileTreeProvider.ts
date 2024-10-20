
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
    const key = element.resourceUri.fsPath;
    const checkboxState =
      this.checkedItems.get(key) ?? vscode.TreeItemCheckboxState.Unchecked;
    element.checkboxState = checkboxState;
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

    // Sort directories above files and alphabetically
    dirEntries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
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
    }

    // Update parent directories' states
    let dirPath = path.dirname(key);
    while (dirPath.startsWith(this.workspaceRoot)) {
      await this.updateParentState(dirPath);
      dirPath = path.dirname(dirPath);
    }

    this.refresh();
  }

  private async updateParentState(dirPath: string): Promise<void> {
    const siblings = await fs.promises.readdir(dirPath);

    let allChecked = true;

    for (const sibling of siblings) {
      const siblingPath = path.join(dirPath, sibling);
      const state =
        this.checkedItems.get(siblingPath) ??
        vscode.TreeItemCheckboxState.Unchecked;
      if (state !== vscode.TreeItemCheckboxState.Checked) {
        allChecked = false;
        break;
      }
    }

    if (allChecked) {
      this.checkedItems.set(dirPath, vscode.TreeItemCheckboxState.Checked);
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

    const relativeDirPath = path.relative(this.workspaceRoot, dirPath);
    const isDirGitIgnored = this.isGitIgnored(relativeDirPath);

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);

      // If parent directory is gitignored, proceed to update its children
      // If parent directory is not gitignored, skip updating gitignored directories
      if (!isDirGitIgnored && entry.isDirectory() && this.isGitIgnored(relativePath)) {
        continue; // Skip gitignored directories
      }

      this.checkedItems.set(fullPath, state);

      if (entry.isDirectory()) {
        await this.updateDirectoryCheckState(fullPath, state);
      }
    }
  }

  getCheckedFiles(): string[] {
    return Array.from(this.checkedItems.entries())
      .filter(([_, state]) => state === vscode.TreeItemCheckboxState.Checked)
      .map(([path, _]) => path)
      .filter((path) => fs.existsSync(path) && fs.statSync(path).isFile());
  }

  public async setCheckedFiles(filePaths: string[]): Promise<void> {
    // Clear existing checks
    this.checkedItems.clear();

    // For each file in filePaths, set its checkboxState to Checked
    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        this.checkedItems.set(filePath, vscode.TreeItemCheckboxState.Checked);
      }
    }

    // Update parent directories' checkbox states
    for (const filePath of filePaths) {
      let dirPath = path.dirname(filePath);
      while (dirPath.startsWith(this.workspaceRoot)) {
        await this.updateParentState(dirPath);
        dirPath = path.dirname(dirPath);
      }
    }

    // Refresh the tree view
    this.refresh();
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
