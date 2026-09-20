from http.server import BaseHTTPRequestHandler,HTTPServer
import json
class Handler(BaseHTTPRequestHandler):
 def do_OPTIONS(self):
  self.send_response(204);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','Content-Type,Authorization');self.end_headers()
 def do_POST(self):
  self.rfile.read(int(self.headers.get('Content-Length',0)))
  result={'story':'【DEV ONLY · 接口联调】\n\n本条由本地测试服务返回，用于验证回合、状态与存档，不是正式游戏剧情。','summary':'本地接口测试成功，状态和记忆已同步。','player':{'姓名':'DEV ONLY 测试修士','修为':'炼气期一层'},'npcs':[],'items':[{'id':'dev-item','name':'DEV ONLY 测试物品','quantity':1}],'world':{'location':'DEV ONLY 测试地点','intel':['本地联调数据']},'elapsedMinutes':15,'longSummary':'六回合测试归档','facts':['DEV ONLY'],'actions':['测试观察','测试交谈','测试离开']}
  body=json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps(result,ensure_ascii=False)}}]},ensure_ascii=False).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Access-Control-Allow-Origin','*');self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',8766),Handler).serve_forever()
