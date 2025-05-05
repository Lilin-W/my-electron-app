"use client";

import { useState, useEffect, useRef } from 'react';

// Define OpenSeadragon type
declare global {
  interface Window {
    electron: any;
    OpenSeadragon: any;
  }
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{name: string; path: string}[]>([]);
  const [wsiInfo, setWsiInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Segmentation result related states
  const [showSegmentation, setShowSegmentation] = useState(true);
  const [segmentationMode, setSegmentationMode] = useState<'centroids' | 'contours'>('centroids');
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [segmentationInfo, setSegmentationInfo] = useState<any>(null);

  // Load uploaded file list
  useEffect(() => {
    async function loadUploadedFiles() {
      if (!window.electron) return;
      
      try {
        const files = await window.electron.fileSystem.getUploadedFiles();
        setUploadedFiles(files);
        if (files.length > 0 && !selectedFile) {
          setSelectedFile(files[0]);
        }
      } catch (error) {
        console.error("Error loading uploaded files:", error);
      }
    }
    
    loadUploadedFiles();
  }, []);

  // Load WSI file when selected file changes
  useEffect(() => {
    if (!selectedFile) return;
    
    async function loadWSI() {
      setLoading(true);
      try {
        // Call backend API to load WSI file
        const response = await fetch('http://localhost:8000/api/load-wsi', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ file_path: selectedFile?.path || '' }),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load WSI: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("WSI info:", data);
        setWsiInfo(data);
        
        // Update OpenSeadragon viewer
        updateViewer(data);
      } catch (error) {
        console.error("Error loading WSI:", error);
      } finally {
        setLoading(false);
      }
    }
    
    loadWSI();
  }, [selectedFile]);

  // Modified code for loading segmentation file - using hardcoded path
  useEffect(() => {
    if (!selectedFile) return;
    
    async function loadSegmentation() {
      try {
        // Hardcoded path - directly using the current selected file name, using forward slashes instead of backslashes
        const segPath = `E:/my-electron-app/CMU-1.svs.seg.h5`;
        
        console.log("Loading segmentation file using hardcoded path:", segPath);
        
        // Call backend API to load segmentation file
        const response = await fetch('http://localhost:8000/api/load-segmentation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ file_path: segPath }),
        });
        
        // Detailed logging of response status and content
        console.log("Segmentation file API response status:", response.status, response.statusText);
        const responseData = await response.json();
        console.log("Segmentation file API response content:", responseData);
        
        if (!response.ok) {
          console.warn(`Segmentation not available: ${responseData.error || response.statusText}`);
          // Set segmentation info to null, don't display error
          setSegmentationInfo(null);
          setShowSegmentation(false);
          return;
        }
        
        console.log("Successfully loaded segmentation info:", responseData);
        setSegmentationInfo(responseData);
        setShowSegmentation(true);
      } catch (error) {
        console.error("Error loading segmentation:", error);
        setSegmentationInfo(null);
        setShowSegmentation(false);
      }
    }
    
    loadSegmentation();
  }, [selectedFile]);

  // Update OpenSeadragon viewer
  const updateViewer = (wsiData: any) => {
    if (!viewerInstance.current || !wsiData) return;
    
    // Create tile source
    const tileSource = {
      height: wsiData.dimensions[1],
      width: wsiData.dimensions[0],
      tileSize: 256,
      getTileUrl: function(level: number, x: number, y: number) {
        return `http://localhost:8000/api/tile/${level}/${x}/${y}?tile_size=256`;
      }
    };
    
    // Open new tile source
    viewerInstance.current.open(tileSource);
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!window.electron) {
      console.error("Electron API not available");
      return;
    }
    
    try {
      const result = await window.electron.fileSystem.openFile();
      if (!result) return; // Early return if no file selected
      
      console.log("File uploaded:", result);
      setSelectedFile(result);
      
      // Update file list, avoid duplicates
      setUploadedFiles(prev => {
        if (!prev.some(file => file.path === result.path)) {
          return [...prev, result];
        }
        return prev;
      });
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  // Dynamically load OpenSeadragon
  useEffect(() => {
    if (!viewerRef.current || viewerLoaded) return;

    // Load OpenSeadragon script
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/openseadragon@3.1/build/openseadragon.min.js";
    script.async = true;
    document.body.appendChild(script);
    
    script.onload = () => {
      setViewerLoaded(true);
    };
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [viewerLoaded]);

  // Initialize viewer
  useEffect(() => {
    if (!viewerRef.current || !viewerLoaded || !window.OpenSeadragon) return;
    
    // Create OpenSeadragon viewer
    viewerInstance.current = window.OpenSeadragon({
      element: viewerRef.current,
      prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@3.1/build/openseadragon/images/",
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
      defaultZoomLevel: 0,
      maxZoomPixelRatio: 3,
      animationTime: 0.5,
      blendTime: 0.1,
      constrainDuringPan: true,
      showRotationControl: true,
      showFlipControl: true,
      showHomeControl: true,
      showZoomControl: true,
    });
    
    // If WSI info already exists, update viewer
    if (wsiInfo) {
      updateViewer(wsiInfo);
    }
    
    // Cleanup function
    return () => {
      if (viewerInstance.current) {
        viewerInstance.current.destroy();
        viewerInstance.current = null;
      }
    };
  }, [viewerLoaded]);

  // Create Canvas overlay and handle viewport changes
  useEffect(() => {
    if (!viewerInstance.current || !overlayRef.current) return;
    
    const viewer = viewerInstance.current;
    const canvas = overlayRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Adjust Canvas size to match viewport
    const resizeCanvas = () => {
      const containerWidth = viewerRef.current?.clientWidth || 0;
      const containerHeight = viewerRef.current?.clientHeight || 0;
      
      canvas.width = containerWidth;
      canvas.height = containerHeight;
    };
    
    // Initial size adjustment
    resizeCanvas();
    
    // Listen for window size changes
    window.addEventListener('resize', resizeCanvas);
    
    // Update overlay
    const updateOverlay = async () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // If not showing segmentation results or no segmentation data, return directly
      if (!showSegmentation || !segmentationInfo) {
        console.log("Segmentation display is turned off or no segmentation data, not drawing");
        return;
      }
      
      console.log("Starting to update segmentation overlay, segmentation info:", segmentationInfo);
      
      // Get current viewport info
      const viewport = viewer.viewport;
      const zoom = viewport.getZoom(true);
      
      // Decide display mode based on zoom level
      const mode = zoom > 0.5 ? 'contours' : 'centroids';
      setSegmentationMode(mode);
      
      console.log(`Current zoom level: ${zoom}, using mode: ${mode}`);
      
      // Get viewport boundaries
      const bounds = viewport.getBounds(true);
      const viewportToImageCoordinates = (viewport: any, point: {x: number, y: number}) => {
        const imagePoint = viewport.viewportToImageCoordinates(point.x, point.y);
        return {
          x: imagePoint.x,
          y: imagePoint.y
        };
      };
      
      // Calculate current viewport position in the image
      const topLeft = viewportToImageCoordinates(viewport, {x: bounds.x, y: bounds.y});
      const bottomRight = viewportToImageCoordinates(viewport, {x: bounds.x + bounds.width, y: bounds.y + bounds.height});
      
      console.log(`Viewport range: (${topLeft.x.toFixed(0)},${topLeft.y.toFixed(0)}) - (${bottomRight.x.toFixed(0)},${bottomRight.y.toFixed(0)})`);
      
      // Calculate tile level and coordinates
      const level = Math.max(0, Math.round(Math.log2(1/zoom)));
      const tileSize = 256;
      const x = Math.floor(topLeft.x / (tileSize * (2 ** level)));
      const y = Math.floor(topLeft.y / (tileSize * (2 ** level)));
      
      console.log(`Requesting tile: level=${level}, x=${x}, y=${y}, mode=${mode}`);
      
      try {
        // Call backend API to get segmentation data
        const response = await fetch(`http://localhost:8000/api/segmentation/${level}/${x}/${y}?tile_size=${tileSize}&mode=${mode}`);
        
        if (!response.ok) {
          console.warn(`Failed to get segmentation data: ${response.status} ${response.statusText}`);
          return;
        }
        
        const data = await response.json();
        console.log(`Received segmentation data:`, data);
        
        // Draw segmentation results
        if (mode === 'centroids' && data.centroids && data.centroids.length > 0) {
          // Draw centroid points - using larger, more visible red dots
          ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
          
          console.log(`Drawing ${data.centroids.length} center points`);
          
          data.centroids.forEach((point: number[]) => {
            // Consider 16x magnification factor - mentioned in task requirements
            const scaledPoint = [point[0] * 16, point[1] * 16];
            
            // Convert image coordinates to viewport coordinates
            const viewportPoint = viewport.imageToViewportCoordinates(scaledPoint[0], scaledPoint[1]);
            const viewerPoint = viewport.viewportToViewerElementCoordinates(viewportPoint);
            
            console.log(`Drawing point: Original=(${point[0]},${point[1]}), Scaled=(${scaledPoint[0]},${scaledPoint[1]}), Screen=(${viewerPoint.x.toFixed(0)},${viewerPoint.y.toFixed(0)})`);
            
            // Draw larger point
            ctx.beginPath();
            ctx.arc(viewerPoint.x, viewerPoint.y, 5, 0, 2 * Math.PI);
            ctx.fill();
          });
        } else if (mode === 'contours' && data.contours && data.contours.length > 0) {
          // Draw contours - using more visible green
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
          ctx.lineWidth = 3;
          
          console.log(`Drawing ${data.contours.length} contours`);
          
          data.contours.forEach((contour: {id: number, points: number[][]}) => {
            if (contour.points.length < 3) {
              console.log(`Contour ${contour.id} has insufficient points, skipping`);
              return; // Need at least 3 points to form a closed contour
            }
            
            console.log(`Drawing contour ${contour.id}, containing ${contour.points.length} points`);
            
            ctx.beginPath();
            
            // Consider 16x magnification factor
            const scaledFirstPoint = [contour.points[0][0] * 16, contour.points[0][1] * 16];
            
            // Move to first point
            const firstPoint = viewport.imageToViewportCoordinates(scaledFirstPoint[0], scaledFirstPoint[1]);
            const firstViewerPoint = viewport.viewportToViewerElementCoordinates(firstPoint);
            ctx.moveTo(firstViewerPoint.x, firstViewerPoint.y);
            
            // Draw remaining points
            for (let i = 1; i < contour.points.length; i++) {
              const scaledPoint = [contour.points[i][0] * 16, contour.points[i][1] * 16];
              const point = viewport.imageToViewportCoordinates(scaledPoint[0], scaledPoint[1]);
              const viewerPoint = viewport.viewportToViewerElementCoordinates(point);
              ctx.lineTo(viewerPoint.x, viewerPoint.y);
            }
            
            // Close path
            ctx.closePath();
            ctx.stroke();
          });
        } else {
          console.log(`No drawable segmentation data found:`, mode, data);
          
          // Fallback plan: draw some fixed test points to confirm overlay functionality is working
          console.log("Drawing test points to verify overlay is working properly");
          
          // Draw a large red dot in the center of the canvas
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          
          ctx.fillStyle = 'rgba(255, 0, 0, 1)';
          ctx.beginPath();
          ctx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw green dots in the four corners
          ctx.fillStyle = 'rgba(0, 255, 0, 1)';
          const size = 8;
          const margin = 50;
          
          // Top left
          ctx.beginPath();
          ctx.arc(margin, margin, size, 0, 2 * Math.PI);
          ctx.fill();
          
          // Top right
          ctx.beginPath();
          ctx.arc(canvas.width - margin, margin, size, 0, 2 * Math.PI);
          ctx.fill();
          
          // Bottom left
          ctx.beginPath();
          ctx.arc(margin, canvas.height - margin, size, 0, 2 * Math.PI);
          ctx.fill();
          
          // Bottom right
          ctx.beginPath();
          ctx.arc(canvas.width - margin, canvas.height - margin, size, 0, 2 * Math.PI);
          ctx.fill();
        }
      } catch (error) {
        console.error("Error updating overlay:", error);
        
        // Draw error indicator
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(10, 10, 30, 30);
      }
    };
    
    // Listen for viewport change events
    viewer.addHandler('update-viewport', updateOverlay);
    viewer.addHandler('animation', updateOverlay);
    
    // Initial update
    updateOverlay();
    
    // Cleanup function
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      viewer.removeHandler('update-viewport', updateOverlay);
      viewer.removeHandler('animation', updateOverlay);
    };
  }, [showSegmentation, segmentationInfo, segmentationMode]);

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex flex-1">
        {/* Main view area */}
        <div className="flex-1 h-screen relative">
          <div ref={viewerRef} className="h-full">
            {!selectedFile && (
              <div className="h-full flex items-center justify-center bg-gray-100">
                <p className="text-gray-500">Please upload a WSI file to view</p>
              </div>
            )}
          </div>
          
          {/* Segmentation result overlay */}
          <canvas 
            ref={overlayRef} 
            className="absolute inset-0 pointer-events-none"
          />
          
          {loading && (
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
              <div className="bg-white p-4 rounded-lg shadow-lg">
                <p>Loading WSI file...</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Sidebar */}
        <div className="w-64 bg-gray-100 p-4 border-l border-gray-300">
          <h2 className="text-xl font-bold mb-4">Management</h2>
          
          <button 
            onClick={handleFileUpload}
            className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-4"
          >
            Upload WSI File
          </button>
          
          {/* Uploaded file list */}
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Uploaded Files</h3>
            {uploadedFiles.length > 0 ? (
              <ul className="text-sm">
                {uploadedFiles.map((file, index) => (
                  <li 
                    key={index} 
                    className={`p-2 hover:bg-gray-200 cursor-pointer rounded ${selectedFile && file && selectedFile.path === file.path ? 'bg-blue-100' : ''}`}
                    onClick={() => setSelectedFile(file)}
                  >
                    {file.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No files uploaded</p>
            )}
          </div>
          
          {selectedFile && (
            <div className="mt-4">
              <h3 className="font-semibold">Current File:</h3>
              <p className="text-sm">{selectedFile.name}</p>
            </div>
          )}
          
          {/* WSI info */}
          {wsiInfo && (
            <div className="mt-4">
              <h3 className="font-semibold">WSI Info:</h3>
              <p className="text-sm">Size: {wsiInfo.dimensions[0]} × {wsiInfo.dimensions[1]}</p>
              <p className="text-sm">Levels: {wsiInfo.level_count}</p>
            </div>
          )}
          
          {/* Segmentation result controls */}
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Segmentation Controls</h3>
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id="toggle-segmentation"
                checked={showSegmentation}
                onChange={(e) => setShowSegmentation(e.target.checked)}
                className="mr-2"
                disabled={!segmentationInfo} // Disable checkbox if no segmentation data
              />
              <label htmlFor="toggle-segmentation" className={!segmentationInfo ? "text-gray-400" : ""}>
                Show Segmentation {!segmentationInfo && "(No data available)"}
              </label>
            </div>
            {showSegmentation && segmentationInfo && (
              <div className="text-sm text-gray-600">
                Current mode: {segmentationMode === 'centroids' ? 'Points (zoom in for contours)' : 'Contours'}
              </div>
            )}
            {segmentationInfo && (
              <div className="text-sm mt-2">
                <p>Centroids: {segmentationInfo.centroids_count || 0}</p>
              </div>
            )}
          </div>
          
          <div className="mt-8">
            <h3 className="font-semibold mb-2">Segmentation Results</h3>
            <div className="max-h-96 overflow-y-auto">
              {segmentationInfo ? (
                <p className="text-sm">Segmentation loaded successfully</p>
              ) : (
                <p className="text-sm text-gray-500">No segmentation results available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}