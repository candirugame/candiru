# Reduce Texture Resolution of a Blender File

The following python script reduces the resolution of all textures in a Blender file by 50%.

```python
import bpy

def resize_image(image, scale_factor=0.5):
    # Calculate new dimensions
    new_width = int(image.size[0] * scale_factor)
    new_height = int(image.size[1] * scale_factor)

    # Ensure the image is packed or has a file path
    if image.packed_file:
        image.unpack(method='USE_ORIGINAL')

    # Get the file path
    filepath = bpy.path.abspath(image.filepath)

    # Skip images without a valid file path
    if not filepath:
        print(f"Skipping image '{image.name}' because it has no valid file path.")
        return

    # Scale the image
    image.scale(new_width, new_height)

    # Save the resized image
    image.filepath_raw = filepath
    image.file_format = 'PNG'  # Change format if needed
    image.save()

def main():
    # Iterate over all images in the Blender file
    for image in bpy.data.images:
        if image.size[0] > 0 and image.size[1] > 0:
            print(f"Processing image: {image.name}")
            resize_image(image)

if __name__ == "__main__":
    main()
```
