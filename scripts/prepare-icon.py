from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root=Path(__file__).resolve().parent.parent
# For macOS .icns conversion, the source image must be at least 512x512; it should be designed at 1024x1024 and then scaled down to the various sizes required for different platforms.
S=1024; k=S/256
img=Image.new("RGBA",(S,S),(0,0,0,0)); draw=ImageDraw.Draw(img)
draw.rounded_rectangle((8*k,8*k,248*k,248*k),radius=64*k,fill="#2E7D6B")
font=ImageFont.truetype(str(root/"resources/fonts/NotoSansSC-Regular.ttf"),int(156*k))
draw.text((128*k,115*k),"译",font=font,fill="white",anchor="mm")
img.save(root/"resources/icon.png")
img.save(root/"resources/icon.ico",sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
