import bpy
import os
import shutil

# Function to reduce texture resolution by half
def reduce_texture_resolution(image):
    if image:
        width = image.size[0]
        height = image.size[1]
        new_width = 128
        new_height = 128
        image.scale(new_width, new_height)

# Function to process a single .glb file
def process_glb_file(file_path, temp_folder, output_folder):
    # Clear existing objects in the scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Copy the file to the temp folder
    temp_file_path = os.path.join(temp_folder, os.path.basename(file_path))
    shutil.copy(file_path, temp_file_path)

    # Import the .glb file from the temp folder
    bpy.ops.import_scene.gltf(filepath=temp_file_path)

    # Iterate through all materials and reduce texture resolution
    for material in bpy.data.materials:
        if material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == 'TEX_IMAGE':
                    reduce_texture_resolution(node.image)

    # Export the modified .glb file back to the temp folder
    bpy.ops.export_scene.gltf(filepath=temp_file_path)

    # Move the modified file to the output folder
    old_filename = os.path.basename(temp_file_path)
    new_filename = f"reduced_texture_{old_filename}"
    output_path = os.path.join(output_folder, new_filename)
    shutil.move(temp_file_path, output_path)

# Directory containing .glb files
input_directory = "original_models"
temp_folder = "temp"
output_folder = "models"

# Create temp and output folders if they don't exist
os.makedirs(temp_folder, exist_ok=True)
os.makedirs(output_folder, exist_ok=True)

# Process all .glb files in the directory
for filename in os.listdir(input_directory):
    if filename.endswith(".glb"):
        file_path = os.path.join(input_directory, filename)
        process_glb_file(file_path, temp_folder, output_folder)
        print(f"Processed: {filename}")

# Clean up the temp folder after processing
shutil.rmtree(temp_folder)
print("Temporary files cleaned up.")
