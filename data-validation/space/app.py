"""CPU 무료 Space: 사진 확인 + OCR 응답과 정답 대조. OCR 실행은 Colab에서."""
import sys, json
from pathlib import Path
import gradio as gr
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from evaluate import compare
PAIRS=json.loads((ROOT/'data/pairs.json').read_text(encoding='utf-8'))

def show_pair(pair_id):
    pair=next(p for p in PAIRS if p['pair_id']==pair_id)
    return str(ROOT/pair['image_path']),json.dumps(pair['ingredients'],ensure_ascii=False,indent=2),pair['gold_status']

def check(pair_id,raw):
    try:
        pair=next(p for p in PAIRS if p['pair_id']==pair_id)
        return compare(pair,json.loads(raw))
    except (ValueError,TypeError,StopIteration) as e:
        return {'error':str(e),'scored':False}

with gr.Blocks(title='GlowPick 전성분 검증') as demo:
    gr.Markdown('# GlowPick 전성분 검증\n웹 상세 이미지의 임시 정답입니다. 실물 촬영 데이터·실제 OCR 성능과 구분하세요. 이 화면은 모델을 호출하지 않습니다.')
    choice=gr.Dropdown([p['pair_id'] for p in PAIRS],value=PAIRS[0]['pair_id'],label='검증 쌍')
    with gr.Row():
        image=gr.Image(label='원자료',interactive=False)
        with gr.Column():
            gold=gr.Textbox(label='임시 정답',lines=8,interactive=False)
            state=gr.Textbox(label='검토 상태',interactive=False)
    response=gr.Textbox(label='실제 OCR 응답 JSON 붙여넣기',lines=8)
    button=gr.Button('비교');result=gr.JSON(label='누락·추가·순서·CER')
    choice.change(show_pair,choice,[image,gold,state])
    demo.load(show_pair,choice,[image,gold,state])
    button.click(check,[choice,response],result)

if __name__=='__main__':
    demo.launch()
