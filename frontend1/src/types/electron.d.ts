interface FileResult {
    path: string;
    name: string;
  }
  
  interface ElectronAPI {
    fileSystem: {
      openFile: () => Promise<FileResult | null>;
      getUploadedFiles: () => Promise<FileResult[]>;
    }
  }
  
  declare global {
    interface Window {
      electron: ElectronAPI;
    }
  }
  
  export {};