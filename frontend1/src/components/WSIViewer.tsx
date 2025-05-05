"use client";

import { useEffect, useRef } from 'react';
import OpenSeadragon from 'openseadragon';

interface WSIViewerProps {
  filePath?: string;
}

export default function WSIViewer({ filePath }: WSIViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<OpenSeadragon.Viewer | null>(null);

  useEffect(() => {
    if (!viewerRef.current) return;
    
    // 初始化查看器
    viewerInstance.current = OpenSeadragon({
      element: viewerRef.current,
      prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
      tileSources: {
        type: 'image',
        url: '/placeholder-image.jpg', // 暂时使用占位图
      },
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
      zoomInButton: 'zoom-in',
      zoomOutButton: 'zoom-out',
      homeButton: 'home',
      fullPageButton: 'full-page',
      maxZoomPixelRatio: 2,
      defaultZoomLevel: 0,
      animationTime: 0.5,
    });

    // 如果有文件路径，则加载对应的WSI文件
    if (filePath) {
      // 这里需要实现加载WSI文件的逻辑
      console.log("Loading WSI file:", filePath);
    }

    return () => {
      if (viewerInstance.current) {
        viewerInstance.current.destroy();
        viewerInstance.current = null;
      }
    };
  }, [filePath]);

  return (
    <div className="relative w-full h-full">
      <div ref={viewerRef} className="absolute inset-0"></div>
      <div className="absolute top-2 right-2 flex space-x-2 z-10">
        <button id="zoom-in" className="bg-white p-2 rounded shadow">+</button>
        <button id="zoom-out" className="bg-white p-2 rounded shadow">-</button>
        <button id="home" className="bg-white p-2 rounded shadow">⌂</button>
        <button id="full-page" className="bg-white p-2 rounded shadow">⛶</button>
      </div>
    </div>
  );
}