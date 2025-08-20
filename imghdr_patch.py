"""
Patch for missing imghdr module in Python 3.13
This creates a minimal imghdr module that provides the basic functionality needed by Streamlit
"""

import sys
import os

# Create a minimal imghdr module
imghdr_code = '''
def what(file, h=None):
    """Determine the type of image contained in a file or byte stream."""
    if h is None:
        if isinstance(file, str):
            f = open(file, 'rb')
            h = f.read(32)
            f.close()
        else:
            location = file.tell()
            h = file.read(32)
            file.seek(location)
            if not h:
                return None
    
    if h[:8] == b'\\x89PNG\\r\\n\\x1a\\n':
        return 'png'
    if h[:2] == b'\\xff\\xd8':
        return 'jpeg'
    if h[:4] == b'GIF8':
        return 'gif'
    if h[:4] == b'RIFF' and h[8:12] == b'WEBP':
        return 'webp'
    if h[:2] == b'BM':
        return 'bmp'
    if h[:4] == b'\\x00\\x00\\x01\\x00':
        return 'ico'
    return None
'''

# Create the imghdr module
import types
imghdr = types.ModuleType('imghdr')
exec(imghdr_code, imghdr.__dict__)

# Add it to sys.modules so it can be imported
sys.modules['imghdr'] = imghdr

print("✅ imghdr module patch applied successfully!") 