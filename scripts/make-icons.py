"""Generate the app's small vector-style icon set without remote assets."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'src-tauri' / 'icons'
root.mkdir(parents=True, exist_ok=True)

def curve(a, b, c, d, count=70):
    result = []
    for i in range(count + 1):
        t = i / count
        result.append(tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*d[k] for k in (0, 1)))
    return result

points = curve((512,180),(460,300),(285,430),(285,590)) + curve((285,590),(285,890),(739,890),(739,590)) + curve((739,590),(739,430),(564,300),(512,180))
icon = Image.new('RGBA', (1024,1024))
draw = ImageDraw.Draw(icon)
draw.rounded_rectangle((30,30,994,994), radius=224, fill='#244e3c')
draw.polygon(points, fill='#f4f1df')
draw.ellipse((425,558,449,582), fill='#244e3c')
draw.ellipse((575,558,599,582), fill='#244e3c')
draw.arc((437,574,587,681),0,180, fill='#244e3c', width=17)
icon.save(root/'icon.png')
for size,name in [(32,'32x32.png'),(128,'128x128.png'),(256,'128x128@2x.png')]:
    icon.resize((size,size),Image.Resampling.LANCZOS).save(root/name)
icon.save(root/'icon.icns', format='ICNS')
icon.save(root/'icon.ico', format='ICO', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
tray = Image.new('RGBA',(1024,1024))
ImageDraw.Draw(tray).polygon(points,fill='black')
tray.resize((32,32),Image.Resampling.LANCZOS).save(root/'tray.png')
print('Generated app and tray icons')
