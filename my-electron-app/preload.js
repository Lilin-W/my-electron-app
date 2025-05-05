const { contextBridge, ipcRenderer } = require('electron');  // Expose API on the window object
contextBridge.exposeInMainWorld('electron', {
  // File operations
  fileSystem: {
    // Open file selection dialog and upload file
    openFile: () => ipcRenderer.invoke('open-file-dialog'),
    // Get list of uploaded files
    getUploadedFiles: () => ipcRenderer.invoke('get-uploaded-files')
  }
});