interface ElectronAPI {
    fileSystem: {
      openFile: () => Promise<{ path: string; name: string } | null>;
      getUploadedFiles: () => Promise<{ path: string; name: string }[]>;
    }
  }
  
  declare global {
    interface Window {
      electron: ElectronAPI;
      OpenSeadragon: any;
    }
  }
  
  export {};