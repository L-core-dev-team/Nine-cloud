from pathlib import Path
import json,hashlib
base=Path(__file__).resolve().parent.parent
h=(base/'outputs/九霄WEB-1.0/九霄WEB-1.0.html').read_text(encoding='utf-8')
results={
 'js_matches_build':(base/'work/v1.js').read_text(encoding='utf-8') in h,
 'css_matches_build':(base/'work/v1.css').read_text(encoding='utf-8') in h,
 'ocr_records':len(json.loads((base/'outputs/设定OCR数据.json').read_text(encoding='utf-8'))['records']),
 'test_cases':(base/'outputs/九霄WEB-1.0/tests.html').read_text(encoding='utf-8').count("test('"),
 'background_exists':(base/'outputs/九霄WEB-1.0/仙山夜景.png').is_file(),
 'html_sha256':hashlib.sha256((base/'outputs/九霄WEB-1.0/九霄WEB-1.0.html').read_bytes()).hexdigest()
}
print(json.dumps(results,ensure_ascii=False,indent=2))
