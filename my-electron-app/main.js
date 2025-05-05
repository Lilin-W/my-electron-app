const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

// Save reference to the main window
let mainWindow;

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Security setting
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // Preload script for safely exposing IPC functionality
    }
  });
    
  // Determine if in development or production mode
  const isDev = true; // Force development mode
   
  if (isDev) {
    // In development mode, load Next.js development server
    mainWindow.loadURL('http://localhost:3000');
    // Open developer tools
    mainWindow.webContents.openDevTools();
  } else {
    // In production mode, load packaged Next.js application
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, '../renderer/out/index.html'),
        protocol: 'file:',
        slashes: true
      })
    );
  }

  // Triggered when window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when application is ready
app.whenReady().then(createWindow);

// Quit the application when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Recreate window when dock icon is clicked on macOS
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle file upload
ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'WSI Files', extensions: ['svs', 'tif', 'tiff', 'ndpi'] }
    ]
  });
   
  if (!canceled && filePaths.length > 0) {
    const filePath = filePaths[0];
    const fileName = path.basename(filePath);
       
    // Create a target folder to save uploaded files (if it doesn't exist)
    const uploadDir = path.join(app.getPath('userData'), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
       
    // Target path
    const targetPath = path.join(uploadDir, fileName);
       
    // Copy file
    fs.copyFileSync(filePath, targetPath);
       
    return {
      path: targetPath,
      name: fileName
    };
  }
   
  return null;
});

// Get list of uploaded files
ipcMain.handle('get-uploaded-files', () => {
  const uploadDir = path.join(app.getPath('userData'), 'uploads');
   
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    return [];
  }
   
  const files = fs.readdirSync(uploadDir)
    .filter(file => ['svs', 'tif', 'tiff', 'ndpi'].includes(path.extname(file).slice(1)))
    .map(file => ({
      name: file,
      path: path.join(uploadDir, file)
    }));
   
  return files;
});