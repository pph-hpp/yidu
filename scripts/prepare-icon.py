from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root=Path(__file__).resolve().parent.parent
img=Image.new("RGBA",(256,256),(0,0,0,0)); draw=ImageDraw.Draw(img)
draw.rounded_rectangle((8,8,248,248),radius=64,fill="#2E7D6B")
font=ImageFont.truetype(str(root/"resources/fonts/NotoSansSC-Regular.ttf"),156)
draw.text((128,115),"译",font=font,fill="white",anchor="mm")
img.save(root/"resources/icon.png")
img.save(root/"resources/icon.ico",sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

