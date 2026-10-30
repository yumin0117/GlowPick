import os,sys,json,hashlib
from pathlib import Path
from PIL import Image
r=Path(__file__).resolve().parents[1];sys.path.insert(0,str(r/'src'))
from hf_ocr import load_model,extract
from evaluate import compare
pairs=json.loads((r/'data/pairs.json').read_text(encoding='utf-8')); specs=[('I001_P003',(195,355,865,435)),('I002_P003',(60,715,865,1010))]
processor,model=load_model();results=[]
for pid,box in specs:
 pair=next(p for p in pairs if p['pair_id']==pid);im=Image.open(r/pair['image_path']).crop(box);path=r/f'images/{pid}_focused.png';im.save(path)
 rec=extract(im,processor,model);rec.update(pair_id=pid,variant='ingredient_region_crop',crop_box=box,image_path=str(path.relative_to(r)),parent_sha256=hashlib.sha256((r/pair['image_path']).read_bytes()).hexdigest(),synthetic_photo=False,physical_photo=False)
 rec['metrics']=compare(pair,rec['response']) if rec['execution_status']=='success' else None
 results.append(rec);(r/'results/crop_retest.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(pid,rec['execution_status'],rec['metrics'],flush=True)
