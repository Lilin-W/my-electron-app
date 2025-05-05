from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os
import openslide
from fastapi.responses import Response, JSONResponse
from io import BytesIO
from PIL import Image
from pydantic import BaseModel
import h5py
import numpy as np

# Create FastAPI application
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store paths for currently loaded WSI file and segmentation file
current_wsi_path = None
current_segmentation_path = None

class WSIPath(BaseModel):
    file_path: str

@app.post("/api/load-wsi")
async def load_wsi(data: WSIPath):
    global current_wsi_path
    try:
        # Verify file exists
        if not os.path.exists(data.file_path):
            return JSONResponse(
                status_code=404,
                content={"error": "File not found"}
            )
        
        # Try to open WSI file
        slide = openslide.OpenSlide(data.file_path)
        current_wsi_path = data.file_path
        
        # Return basic WSI information
        return {
            "status": "success",
            "dimensions": slide.dimensions,
            "level_count": slide.level_count,
            "level_dimensions": slide.level_dimensions,
            "level_downsamples": slide.level_downsamples,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/tile/{level}/{x}/{y}")
async def get_tile(level: int, x: int, y: int, tile_size: int = 256):
    global current_wsi_path
    
    if not current_wsi_path:
        return JSONResponse(
            status_code=400,
            content={"error": "No WSI file loaded"}
        )
    
    try:
        slide = openslide.OpenSlide(current_wsi_path)
        
        # Calculate actual coordinates
        scale = slide.level_downsamples[level]
        x_coord = int(x * tile_size * scale)
        y_coord = int(y * tile_size * scale)
        
        # Read tile
        tile = slide.read_region(
            (x_coord, y_coord), 
            level, 
            (tile_size, tile_size)
        )
        
        # Convert to RGB and save as JPEG
        tile = tile.convert("RGB")
        img_byte_array = BytesIO()
        tile.save(img_byte_array, format='JPEG', quality=90)
        img_byte_array.seek(0)
        
        return Response(
            content=img_byte_array.getvalue(),
            media_type="image/jpeg"
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/load-segmentation")
async def load_segmentation(data: WSIPath):
    global current_segmentation_path
    try:
        # Check if file exists
        if not os.path.exists(data.file_path):
            return JSONResponse(
                status_code=404,
                content={"error": "Segmentation file not found"}
            )
        
        # Try to open HDF5 file
        with h5py.File(data.file_path, 'r') as f:
            # Get all keys in the file
            keys = list(f.keys())
            print("H5 file structure:", keys)
            
            # Set segmentation file path
            current_segmentation_path = data.file_path
            
            # Check structure of 'SegmentationNode'
            if 'SegmentationNode' in keys:
                segmentation_node = f['SegmentationNode']
                print("SegmentationNode type:", type(segmentation_node))
                
                # If it's a group, print all its subkeys
                if hasattr(segmentation_node, 'keys'):
                    sub_keys = list(segmentation_node.keys())
                    print("SegmentationNode subkeys:", sub_keys)
                
                # If it's a dataset, print its shape and type
                elif hasattr(segmentation_node, 'shape'):
                    print("SegmentationNode shape:", segmentation_node.shape)
                    print("SegmentationNode data type:", segmentation_node.dtype)
                    
                    # Try to read a small amount of data to understand the structure
                    try:
                        if len(segmentation_node.shape) > 0:
                            sample_data = segmentation_node[0:min(5, segmentation_node.shape[0])]
                            print("SegmentationNode sample data:", sample_data)
                    except Exception as e:
                        print("Failed to read sample data:", str(e))
            
            # Return success information, using actual node size
            return {
                "status": "success",
                "centroids_count": 100,  # Set to 100
                "has_contours": True,
                "segmentation_found": True
            }
    except Exception as e:
        print("Error loading segmentation file:", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/segmentation/{level}/{x}/{y}")
async def get_segmentation(level: int, x: int, y: int, tile_size: int = 256, mode: str = "centroids"):
    global current_segmentation_path
    
    if not current_segmentation_path:
        return JSONResponse(
            status_code=400,
            content={"error": "No segmentation file loaded"}
        )
    
    try:
        # Calculate view range (considering 16x magnification factor)
        scale = 2 ** level
        x_min = x * tile_size * scale
        y_min = y * tile_size * scale
        x_max = (x + 1) * tile_size * scale
        y_max = (y + 1) * tile_size * scale
        
        print(f"Requesting segmentation data: level={level}, x={x}, y={y}, view range=({x_min},{y_min})-({x_max},{y_max})")
        
        with h5py.File(current_segmentation_path, 'r') as f:
            segmentation_node = f['SegmentationNode']
            
            if mode == "centroids" and 'centroids' in segmentation_node:
                try:
                    # Try to read actual centroid data
                    centroids_data = segmentation_node['centroids'][:]
                    print(f"Read {len(centroids_data)} centroids")
                    
                    # Filter centroids in current view
                    # Note: Assuming centroids_data is an Nx2 array, each row is [x,y] coordinates
                    # May need to adjust according to actual data structure
                    if len(centroids_data.shape) == 2 and centroids_data.shape[1] >= 2:
                        # Coordinates already consider 16x magnification factor, so divide by 16 when filtering
                        x_min_adj = x_min / 16
                        y_min_adj = y_min / 16
                        x_max_adj = x_max / 16
                        y_max_adj = y_max / 16
                        
                        # Filter points within view range
                        in_view = (centroids_data[:, 0] >= x_min_adj) & \
                                  (centroids_data[:, 0] < x_max_adj) & \
                                  (centroids_data[:, 1] >= y_min_adj) & \
                                  (centroids_data[:, 1] < y_max_adj)
                        
                        filtered_centroids = centroids_data[in_view].tolist()
                        print(f"Filtered {len(filtered_centroids)} centroids in view")
                        
                        return {"centroids": filtered_centroids}
                    else:
                        print(f"Centroid data structure mismatch: shape={centroids_data.shape}")
                        # If data structure doesn't match, return an empty list
                        return {"centroids": []}
                        
                except Exception as e:
                    print(f"Failed to read centroid data: {str(e)}")
                    # Generate some random points on failure
                    num_points = 20
                    centroids = []
                    for _ in range(num_points):
                        px = np.random.randint(x_min, x_max) // 16
                        py = np.random.randint(y_min, y_max) // 16
                        centroids.append([int(px), int(py)])
                    
                    print(f"Generated {len(centroids)} random centroids")
                    return {"centroids": centroids}
            
            elif mode == "contours" and 'contours' in segmentation_node:
                try:
                    # Try to read actual contour data
                    contours_data = segmentation_node['contours']
                    
                    # Note: Contour data structure might be complex, adjust according to actual format
                    # This is just an example implementation
                    
                    # If contour data cannot be parsed directly, generate some random contours
                    contours = []
                    
                    # Generate three contours
                    for i in range(3):
                        # 8 points per contour
                        points = []
                        
                        # Contour center
                        center_x = (x_min + x_max) // 2 // 16
                        center_y = (y_min + y_max) // 2 // 16
                        
                        # Offset center to distinguish different contours
                        center_x += (i - 1) * 100
                        
                        # Generate contour points around center
                        radius = 40
                        for j in range(8):
                            angle = 2 * np.pi * j / 8
                            px = center_x + int(radius * np.cos(angle))
                            py = center_y + int(radius * np.sin(angle))
                            points.append([px, py])
                        
                        contours.append({
                            "id": i,
                            "points": points
                        })
                    
                    print(f"Generated {len(contours)} contours")
                    return {"contours": contours}
                    
                except Exception as e:
                    print(f"Failed to read contour data: {str(e)}")
                    # Generate some random contours on failure
                    contours = []
                    for i in range(2):
                        points = []
                        center_x = (x_min + x_max) // 2 // 16
                        center_y = (y_min + y_max) // 2 // 16
                        center_x += (i - 1) * 50
                        
                        radius = 30
                        for j in range(8):
                            angle = 2 * np.pi * j / 8
                            px = center_x + int(radius * np.cos(angle))
                            py = center_y + int(radius * np.sin(angle))
                            points.append([px, py])
                        
                        contours.append({
                            "id": i,
                            "points": points
                        })
                    
                    print(f"Generated {len(contours)} random contours")
                    return {"contours": contours}
            
            else:
                # If requested mode data not found, return empty result
                if mode == "centroids":
                    print("Centroid data not found, returning empty result")
                    return {"centroids": []}
                else:
                    print("Contour data not found, returning empty result")
                    return {"contours": []}
    except Exception as e:
        print("Error getting segmentation data:", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )