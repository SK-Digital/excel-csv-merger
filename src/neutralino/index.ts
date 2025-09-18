import neutralino from '@neutralinojs/lib';
import * as buntralino from 'buntralino-client';

// Excel/CSV Merger App
class ExcelCSVMergerApp {
  private uploadedFiles: any[] = [];
  private sharedColumns: string[] = [];
  private mergedData: any[][] = [];
  private isDialogOpen: boolean = false;

  constructor() {
    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    try {
      // Wait for Neutralino.js to be ready
      await neutralino.init();
      console.log('Neutralino.js initialized successfully');
      
      // Initialize the app when DOM is loaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
      } else {
        this.setupEventListeners();
      }
    } catch (error) {
      console.error('Failed to initialize Neutralino.js:', error);
      // Fallback: still set up event listeners even if Neutralino fails
      this.setupEventListeners();
    }
  }

  private setupEventListeners(): void {
    // File upload events - use Neutralino.js native file selection
    const chooseFilesBtn = document.getElementById('chooseFilesBtn');
    const dropZone = document.getElementById('dropZone');

    if (chooseFilesBtn) {
      // Remove any existing listeners to prevent duplicates
      chooseFilesBtn.removeEventListener('click', this.handleChooseFilesClick);
      chooseFilesBtn.addEventListener('click', this.handleChooseFilesClick.bind(this));
    }

    if (dropZone) {
      // Remove any existing listeners to prevent duplicates
      dropZone.removeEventListener('click', this.handleDropZoneClick);
      dropZone.removeEventListener('dragover', this.handleDragOver);
      dropZone.removeEventListener('dragleave', this.handleDragLeave);
      dropZone.removeEventListener('drop', this.handleFileDrop);
      
      dropZone.addEventListener('click', this.handleDropZoneClick.bind(this));
      dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
      dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      dropZone.addEventListener('drop', (e) => this.handleFileDrop(e));
    }

    // Button events
    const analyzeBtn = document.getElementById('analyzeBtn');
    const mergeBtn = document.getElementById('mergeBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const removeFileBtn = document.getElementById('removeFileBtn');

    if (analyzeBtn) analyzeBtn.addEventListener('click', () => this.analyzeColumns());
    if (mergeBtn) mergeBtn.addEventListener('click', () => this.mergeFiles());
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => this.exportData('excel'));
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportData('csv'));
    if (removeFileBtn) removeFileBtn.addEventListener('click', () => this.removeSelectedFile());
  }

  private handleChooseFilesClick = (e: Event): void => {
    e.preventDefault();
    this.openFileDialog();
  }

  private handleDropZoneClick = (): void => {
    this.openFileDialog();
  }

  private async openFileDialog(): Promise<void> {
    // Prevent multiple dialogs from opening
    if (this.isDialogOpen) {
      return;
    }

    this.isDialogOpen = true;

    try {
      // Use Neutralino.js OS API to show file dialog
      const entries = await neutralino.os.showOpenDialog('Select Files', {
        defaultPath: await neutralino.os.getPath('documents'),
        filters: [
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        multiSelection: true
      });

      // Only process files if entries exist and are not empty
      if (entries && entries.length > 0) {
        await this.processFilePaths(entries);
      }
      // If entries is null or empty, user cancelled - do nothing
    } catch (error) {
      console.error('Error opening file dialog:', error);
      // Only fallback to HTML file input if there's an actual error, not cancellation
      if (error && !error.message?.includes('cancelled') && !error.message?.includes('canceled')) {
        this.showHtmlFileInput();
      }
    } finally {
      // Always reset the flag when dialog closes
      this.isDialogOpen = false;
    }
  }

  private showHtmlFileInput(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.xlsx,.xls,.csv';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const files = Array.from(input.files || []);
      await this.processFiles(files);
      document.body.removeChild(fileInput);
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    const dropZone = event.currentTarget as HTMLElement;
    dropZone.classList.add('dragover');
  }

  private handleDragLeave(event: DragEvent): void {
    const dropZone = event.currentTarget as HTMLElement;
    dropZone.classList.remove('dragover');
  }

  private async handleFileDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const dropZone = event.currentTarget as HTMLElement;
    dropZone.classList.remove('dragover');

    const files = Array.from(event.dataTransfer?.files || []);
    await this.processFiles(files);
  }

  private async processFilePaths(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;

    const validFiles = filePaths.filter(filePath => {
      const extension = filePath.split('.').pop()?.toLowerCase();
      return ['xlsx', 'xls', 'csv'].includes(extension || '');
    });

    for (const filePath of validFiles) {
      try {
        const fileInfo = await this.processFilePath(filePath);
        this.uploadedFiles.push(fileInfo);
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
      }
    }

    this.updateFileList();
    this.updateUploadStatus();
    this.updateButtonStates();
  }

  private async processFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;

    const validFiles = files.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return ['xlsx', 'xls', 'csv'].includes(extension || '');
    });

    for (const file of validFiles) {
      try {
        const fileInfo = await this.processFile(file);
        this.uploadedFiles.push(fileInfo);
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
      }
    }

    this.updateFileList();
    this.updateUploadStatus();
    this.updateButtonStates();
  }

  private async processFilePath(filePath: string): Promise<any> {
    const fileName = filePath.split('/').pop() || filePath;
    const fileExtension = fileName.split('.').pop()?.toLowerCase();

    let data: any[][];
    let columns: string[] = [];

    try {
      // Read file using Neutralino.js filesystem API
      const fileContent = await neutralino.filesystem.readBinaryFile(filePath);
      
      if (fileExtension === 'csv') {
        const csvData = await this.readCSVFromBuffer(fileContent);
        data = csvData.data;
        columns = csvData.columns;
      } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
        const excelData = await this.readExcelFromBuffer(fileContent);
        data = excelData.data;
        columns = excelData.columns;
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      return {
        name: fileName,
        path: filePath,
        type: fileExtension === 'csv' ? 'csv' : 'excel',
        data,
        columns,
        rows: data.length - 1,
        status: 'loaded'
      };
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw error;
    }
  }

  private async processFile(file: File): Promise<any> {
    const fileName = file.name;
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    let data: any[][];
    let columns: string[] = [];

    if (fileExtension === 'csv') {
      const csvData = await this.readCSV(file);
      data = csvData.data;
      columns = csvData.columns;
    } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
      const excelData = await this.readExcel(file);
      data = excelData.data;
      columns = excelData.columns;
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }

    return {
      name: fileName,
      path: file.name,
      type: fileExtension === 'csv' ? 'csv' : 'excel',
      data,
      columns,
      rows: data.length - 1,
      status: 'loaded'
    };
  }

  private async readCSVFromBuffer(buffer: ArrayBuffer): Promise<{ data: any[][], columns: string[] }> {
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      throw new Error('Empty CSV file');
    }

    const data: any[][] = [];
    const columns: string[] = [];

    lines.forEach((line, index) => {
      const row = this.parseCSVLine(line);
      if (index === 0) {
        columns.push(...row.map(col => this.cleanColumnName(col)));
      }
      data.push(row);
    });

    return { data, columns };
  }

  private async readCSV(file: File): Promise<{ data: any[][], columns: string[] }> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      throw new Error('Empty CSV file');
    }

    const data: any[][] = [];
    const columns: string[] = [];

    lines.forEach((line, index) => {
      const row = this.parseCSVLine(line);
      if (index === 0) {
        columns.push(...row.map(col => this.cleanColumnName(col)));
      }
      data.push(row);
    });

    return { data, columns };
  }

  private async readExcelFromBuffer(buffer: ArrayBuffer): Promise<{ data: any[][], columns: string[] }> {
    const workbook = (window as any).XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const jsonData = (window as any).XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const data: any[][] = jsonData;

    if (data.length === 0) {
      throw new Error('Empty Excel file');
    }

    const columns = data[0].map((col: any) => this.cleanColumnName(col));

    return { data, columns };
  }

  private async readExcel(file: File): Promise<{ data: any[][], columns: string[] }> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = (window as any).XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const jsonData = (window as any).XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const data: any[][] = jsonData;

    if (data.length === 0) {
      throw new Error('Empty Excel file');
    }

    const columns = data[0].map((col: any) => this.cleanColumnName(col));

    return { data, columns };
  }

  private parseCSVLine(line: string): any[] {
    const result: any[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private cleanColumnName(colName: string): string {
    if (!colName || colName === '') {
      return 'Unnamed_Column';
    }

    let cleaned = String(colName).trim();
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/[^\w\s-]/g, '');
    cleaned = cleaned.replace(/\s/g, '_');

    return cleaned || 'Unnamed_Column';
  }

  private updateFileList(): void {
    const tbody = document.getElementById('fileListBody');
    if (!tbody) return;

    if (this.uploadedFiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-8">No files uploaded</td></tr>';
      return;
    }

    tbody.innerHTML = this.uploadedFiles.map((file, index) => `
      <tr>
        <td><input type="checkbox" class="file-checkbox rounded" data-index="${index}"></td>
        <td class="font-medium">${file.name}</td>
        <td><span class="px-2 py-1 rounded text-xs ${file.type === 'excel' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'}">${file.type.toUpperCase()}</span></td>
        <td>${file.rows}</td>
        <td>${file.columns.length}</td>
        <td><span class="status-${file.status}">${file.status}</span></td>
      </tr>
    `).join('');

    // Setup checkbox event listeners
    const checkboxes = tbody.querySelectorAll('.file-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.updateRemoveButtonState());
    });

    // Setup select all checkbox
    const selectAllCheckbox = document.getElementById('selectAll') as HTMLInputElement;
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = (e.target as HTMLInputElement).checked;
        checkboxes.forEach(checkbox => {
          (checkbox as HTMLInputElement).checked = isChecked;
        });
        this.updateRemoveButtonState();
      });
    }
  }

  private updateUploadStatus(): void {
    const status = document.getElementById('uploadStatus');
    if (!status) return;

    const count = this.uploadedFiles.length;
    if (count === 0) {
      status.textContent = 'No files uploaded';
      status.className = 'text-sm text-gray-400';
    } else {
      status.textContent = `${count} file(s) uploaded`;
      status.className = 'text-sm text-teal-400';
    }
  }

  private updateButtonStates(): void {
    const hasFiles = this.uploadedFiles.length > 0;
    const hasLoadedFiles = this.uploadedFiles.some(f => f.status === 'loaded');

    const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
    const mergeBtn = document.getElementById('mergeBtn') as HTMLButtonElement;
    const exportExcelBtn = document.getElementById('exportExcelBtn') as HTMLButtonElement;
    const exportCsvBtn = document.getElementById('exportCsvBtn') as HTMLButtonElement;

    if (analyzeBtn) analyzeBtn.disabled = !hasFiles;
    if (mergeBtn) mergeBtn.disabled = !hasLoadedFiles || this.sharedColumns.length === 0;
    if (exportExcelBtn) exportExcelBtn.disabled = this.mergedData.length === 0;
    if (exportCsvBtn) exportCsvBtn.disabled = this.mergedData.length === 0;
  }

  private updateRemoveButtonState(): void {
    const removeBtn = document.getElementById('removeFileBtn') as HTMLButtonElement;
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');

    if (removeBtn) {
      removeBtn.disabled = checkboxes.length === 0;
    }
  }

  private analyzeColumns(): void {
    if (this.uploadedFiles.length === 0) return;

    const allColumns = this.uploadedFiles.map(file => new Set(file.columns));
    const intersection = allColumns.reduce((acc, currentSet) => {
      return new Set([...acc].filter(col => currentSet.has(col)));
    });

    this.sharedColumns = Array.from(intersection).sort();

    const status = document.getElementById('analysisStatus');
    const display = document.getElementById('sharedColumnsDisplay');
    const list = document.getElementById('sharedColumnsList');

    if (status) {
      if (this.sharedColumns.length > 0) {
        status.textContent = `Found ${this.sharedColumns.length} shared columns`;
        status.className = 'text-sm text-teal-400';
      } else {
        status.textContent = 'No shared columns found';
        status.className = 'text-sm text-yellow-400';
      }
    }

    if (display && list) {
      if (this.sharedColumns.length > 0) {
        display.classList.remove('hidden');
        list.innerHTML = this.sharedColumns.map(col =>
          `<span class="bg-teal-900 text-teal-300 px-2 py-1 rounded text-sm">${col}</span>`
        ).join('');
      } else {
        display.classList.add('hidden');
      }
    }

    this.updateButtonStates();
  }

  private async mergeFiles(): Promise<void> {
    if (this.uploadedFiles.length === 0) return;

    try {
      const loadedFiles = this.uploadedFiles.filter(f => f.status === 'loaded');
      this.mergedData = this.mergeFilesData(loadedFiles, this.sharedColumns);

      const message = `Successfully merged ${loadedFiles.length} files!\nTotal rows: ${this.mergedData.length - 1}\nTotal columns: ${this.mergedData[0]?.length || 0}`;
      alert(message);

      this.updateButtonStates();
    } catch (error) {
      console.error('Merge error:', error);
      alert(`Failed to merge files: ${error}`);
    }
  }

  private mergeFilesData(files: any[], sharedColumns: string[]): any[][] {
    if (files.length === 0) return [];

    const mergedData: any[][] = [];
    const headerRow = [...sharedColumns];
    mergedData.push(headerRow);

    files.forEach(file => {
      if (file.status !== 'loaded' || file.data.length === 0) return;

      const headerRow = file.data[0];
      const dataRows = file.data.slice(1);

      dataRows.forEach(row => {
        const mergedRow: any[] = [];

        sharedColumns.forEach(sharedCol => {
          const colIndex = file.columns.indexOf(sharedCol);
          mergedRow.push(colIndex !== -1 ? row[colIndex] : '');
        });

        mergedData.push(mergedRow);
      });
    });

    return mergedData;
  }

  private async exportData(format: 'excel' | 'csv'): Promise<void> {
    if (this.mergedData.length === 0) {
      alert('Please merge files first');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `merged_data_${timestamp}.${format === 'excel' ? 'xlsx' : 'csv'}`;

    try {
      let filePath: string;
      
      // Use Neutralino.js save dialog
      try {
        filePath = await neutralino.os.showSaveDialog('Save Merged File', {
          defaultPath: await neutralino.os.getPath('documents') + '/' + filename,
          filters: format === 'excel' 
            ? [{ name: 'Excel Files', extensions: ['xlsx'] }]
            : [{ name: 'CSV Files', extensions: ['csv'] }]
        });
      } catch (error) {
        // Fallback to default location if dialog fails
        filePath = filename;
      }

      if (format === 'excel') {
        await this.exportToExcel(this.mergedData, filePath);
      } else {
        await this.exportToCSV(this.mergedData, filePath);
      }

      const status = document.getElementById('exportStatus');
      if (status) {
        status.textContent = `Exported to: ${filePath}`;
        status.className = 'mt-4 text-sm text-teal-400';
      }
    } catch (error) {
      console.error('Export error:', error);
      const status = document.getElementById('exportStatus');
      if (status) {
        status.textContent = 'Export failed';
        status.className = 'mt-4 text-sm text-red-400';
      }
    }
  }

  private async exportToCSV(data: any[][], filePath: string): Promise<void> {
    const csvContent = data.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    try {
      await neutralino.filesystem.writeFile(filePath, csvContent);
    } catch (error) {
      // Fallback to browser download if filesystem write fails
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', filePath.split('/').pop() || 'merged_data.csv');
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  private async exportToExcel(data: any[][], filePath: string): Promise<void> {
    const worksheet = (window as any).XLSX.utils.aoa_to_sheet(data);
    const workbook = (window as any).XLSX.utils.book_new();
    (window as any).XLSX.utils.book_append_sheet(workbook, worksheet, 'Merged Data');

    try {
      // Generate buffer and write to file system
      const buffer = (window as any).XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      await neutralino.filesystem.writeBinaryFile(filePath, buffer);
    } catch (error) {
      // Fallback to browser download if filesystem write fails
      (window as any).XLSX.writeFile(workbook, filePath.split('/').pop() || 'merged_data.xlsx');
    }
  }

  private removeSelectedFile(): void {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    const indices = Array.from(checkboxes).map(cb => parseInt((cb as HTMLInputElement).dataset.index || '0'));

    // Remove files in reverse order to maintain indices
    indices.sort((a, b) => b - a).forEach(index => {
      this.uploadedFiles.splice(index, 1);
    });

    this.updateFileList();
    this.updateUploadStatus();
    this.updateButtonStates();

    // Reset analysis
    this.sharedColumns = [];
    const display = document.getElementById('sharedColumnsDisplay');
    if (display) display.classList.add('hidden');

    const status = document.getElementById('analysisStatus');
    if (status) {
      status.textContent = 'Click \'Analyze Columns\' to detect shared columns';
      status.className = 'text-sm text-gray-400';
    }
  }
}

// Initialize the app
new ExcelCSVMergerApp();