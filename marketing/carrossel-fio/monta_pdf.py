"""Junta os 7 slides em um PDF de 7 páginas (documento do LinkedIn). Uso: python3 -I monta_pdf.py"""
from PIL import Image
import glob, os
d = os.path.dirname(os.path.abspath(__file__)); ims = [Image.open(f).convert('RGB') for f in sorted(glob.glob(d + '/slides/slide_0*.png'))]
ims[0].save(d + '/NexoProcess_Fio_carrossel.pdf', save_all=True, append_images=ims[1:], resolution=96.0)
print('pdf', len(ims), 'páginas')
