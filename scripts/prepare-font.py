"""Create the bundled regular font from the official OFL Noto Sans SC variable TTF.
Input: .local/fonts/NotoSansSC-VF.ttf
Source: https://github.com/notofonts/noto-cjk/raw/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf
Run with fonttools available in .local/fonttools; no runtime font download is used.
"""
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / ".local/fonttools"))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont(root / ".local/fonts/NotoSansSC-VF.ttf")
instantiateVariableFont(font, {"wght": 400}, inplace=True)
font.save(root / "resources/fonts/NotoSansSC-Regular.ttf")

