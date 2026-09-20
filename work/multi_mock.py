from http.server import BaseHTTPRequestHandler,HTTPServer
import json
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_OPTIONS(self):
        self.send_response(204);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','Content-Type,Authorization');self.send_header('Access-Control-Allow-Methods','POST,OPTIONS');self.end_headers()
    def do_POST(self):
        d=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        model=d.get('model','');system=d.get('messages',[{}])[0].get('content','')
        status=503 if model=='DEV-fail' or model=='DEV-story-only' and '状态与记忆提取员' in system else 200
        if status!=200:response={'error':{'message':'DEV ONLY simulated state failure'}}
        else:
            state={'player':{'姓名':'DEV ONLY 多AI验收','修为':'炼气一层'},'npcs':[],'items':[{'id':'dev-leaf','name':'DEV测试灵叶','quantity':2,'unit':'片'}],'world':{'location':'DEV测试驿站','intel':['仅供本地验收']},'elapsedMinutes':5,'summary':'DEV ONLY 到达测试驿站','longSummary':'DEV ONLY 测试归档','facts':[],'worldEvents':[],'foreshadowing':[]}
            story={'story':'DEV ONLY 本地模拟正文。\n\n你沿山道抵达测试驿站，收下两片测试灵叶。这段文字仅用于验证多模型调用与状态提交，不属于九霄正式剧情。','actions':['观察测试石碑','到测试茶棚休息','与测试掌柜交谈']}
            if '只回复：连接成功' in json.dumps(d,ensure_ascii=False):content='连接成功'
            elif 'ok' in json.dumps(d,ensure_ascii=False) and '只返回JSON' in json.dumps(d,ensure_ascii=False):content=json.dumps({'ok':True})
            elif '状态与记忆提取员' in system:content=json.dumps(state,ensure_ascii=False)
            elif '主剧情作者' in system:content=json.dumps(story,ensure_ascii=False)
            elif '导演' in system and '不写' in system:content=json.dumps({'plot_beats':[],'npc_intentions':{},'forbidden_events':[],'foreshadowing':[],'continuity_requirements':[]})
            else:content=json.dumps({**state,**story},ensure_ascii=False)
            response={'choices':[{'message':{'content':content},'finish_reason':'stop'}],'usage':{'prompt_tokens':123,'completion_tokens':45}}
        self.send_response(status);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(response,ensure_ascii=False).encode())
HTTPServer(('127.0.0.1',8767),Handler).serve_forever()
