# -*- coding: utf-8 -*-
"""《九霄》玩家需求调查（survey 28047242）回答聚合脚本。
只读 raw/answers-28047242.json，输出 stdout 报告与 统计汇总.json。不修改任何项目文件。
"""
import json
import collections
import io
import sys
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "raw", "answers-28047242.json")

d = json.load(open(RAW, encoding="utf-8"))
answers = d["list"]
N = len(answers)

QMETA = {
    "q-2-c9c5": (1, "玩游戏频率", "radio"),
    "q-3-ed76": (2, "经验背景（分组变量）", "radio"),
    "q-4-53bd": (3, "常用设备", "radio"),
    "q-5-77bb": (4, "单次连续时长", "radio"),
    "q-6-5823": (5, "喜欢/玩过的题材", "checkbox"),
    "q-8-3be8": (6, "更想玩哪一种（多选<=2）", "checkbox"),
    "q-9-ed34": (7, "只能选一种", "radio"),
    "q-10-df6a": (8, "玩家在游戏里的位置", "radio"),
    "q-11-f4cb": (9, "世界：设定好 vs 边玩边生成", "radio"),
    "q-12-b515": (10, "对现有 AI 文字游戏最不满意", "checkbox"),
    "q-14-0b03": (11, "玩法兴趣矩阵(1-5)", "matrix"),
    "q-15-2111": (12, "只能先做好3个玩法", "checkbox"),
    "q-16-3d92": (13, "规则 vs 自由", "radio"),
    "q-17-ab88": (14, "取舍：自由度 vs 稳定", "radio"),
    "q-18-9245": (15, "机制复杂度", "radio"),
    "q-19-6c78": (16, "失败如何处理", "radio"),
    "q-20-ac61": (17, "资源投入排序", "sort"),
    "q-22-9f03": (18, "AI 主要负责什么（多选<=2）", "checkbox"),
    "q-23-39c7": (19, "AI 聪明到什么程度", "radio"),
    "q-24-37d9": (20, "AI 主动制造意外", "radio"),
    "q-26-e71b": (21, "记忆/一致性在意矩阵(1-5)", "matrix"),
    "q-27-e2f6": (22, "取舍：记忆 vs 成本", "radio"),
    "q-28-3e4d": (23, "记性打折扣时更能接受哪种", "radio"),
    "q-29-bb2a": (24, "NPC 独立目的/背叛", "radio"),
    "q-31-c378": (25, "喜欢哪种界面（多选<=2）", "checkbox"),
    "q-32-6b46": (26, "操作方式", "radio"),
    "q-33-cbf6": (27, "配置接受度", "radio"),
    "q-35-1763": (28, "能接受的付费模式", "checkbox"),
    "q-36-6565": (29, "关于自备模型的真实想法", "radio"),
    "q-37-4386": (30, "取舍：费用 vs 记性", "radio"),
    "q-38-11e1": (31, "买断价位接受度", "radio"),
    "q-40-2429": (32, "期待未来做哪些事", "checkbox"),
    "q-41-17e3": (33, "通用平台看法", "radio"),
    "q-42-4c18": (34, "只保留一个功能", "radio"),
    "q-43-512d": (35, "最担心变成什么样", "textarea"),
    "q-46-60ec": (36, "最兴奋的一刻", "textarea"),
    "q-47-440d": (37, "会加的独创功能", "textarea"),
    "q-48-550c": (38, "最大未解痛点", "textarea"),
    "q-49-9d1d": (39, "最难忘的游戏", "textarea"),
    "q-50-27f7": (40, "推荐意愿(0-10)", "star"),
    "q-51-1214": (41, "联系方式(选填)", "textarea"),
}

MATRIX_ITEMS = {
    "q-14-0b03": [
        "修炼与境界突破", "学习功法与招式", "炼丹炼器打造物品", "装备与法宝收集",
        "自由战斗", "地图探索", "秘境副本冒险", "采集与生存", "建造洞府或家园",
        "宗门经营", "结盟与势力斗争", "NPC 社交", "恋爱道侣关系", "自由创造",
        "随机事件", "动态世界", "多结局", "人物长期成长",
    ],
    "q-26-e71b": [
        "NPC 能记住过去的事", "事实不被随便改掉", "世界事件长期影响剧情",
        "NPC 独立认知不越界", "世界记住我做的事并反应", "NPC 主动提起旧事",
        "不玩时世界也在变", "长存档逻辑一致",
    ],
}

SORT_ITEMS = {
    "q-20-ac61": {
        "o-101-e1bf": "剧情内容和文笔",
        "o-102-12de": "玩法系统",
        "o-103-78ef": "美术与画面表现",
        "o-104-0034": "世界设定和人物塑造",
        "o-105-8452": "AI 智能程度",
        "o-106-fb72": "界面和操作手感",
    }
}

# 把每份回答摊平成 qid -> 结构化内容
def flatten(ans):
    out = {}
    for page in ans:
        for q in page["questions"]:
            out[q["id"]] = q
    return out


rows = []
for a in answers:
    flat = flatten(a["answer"])
    rows.append({
        "answer_id": a["answer_id"],
        "started": a.get("started_at"),
        "ended": a.get("ended_at"),
        "flat": flat,
    })


def seg_of(flat):
    q = flat.get("q-3-ed76")
    if not q:
        return "未答"
    opts = q.get("options") or []
    for o in opts:
        if o.get("checked"):
            t = o.get("text", "")
            if "自己配置过" in t:
                return "A 酒馆自配模型"
            if "别人做好的角色卡" in t:
                return "B 酒馆用现成卡"
            if "没用过酒馆" in t:
                return "C 玩过AI文字游戏"
            if "传统文字游戏" in t:
                return "D 只玩传统文字"
            return "E 都没接触过"
    return "未答"


print("=" * 72)
print("《九霄》玩家需求调查（survey 28047242）回答聚合")
print("有效回答 N = %d" % N)
segs = collections.Counter(seg_of(r["flat"]) for r in rows)
print("经验背景分布：", dict(segs))
dur = []
for r in rows:
    try:
        from datetime import datetime
        s = datetime.strptime(r["started"], "%Y-%m-%d %H:%M:%S")
        e = datetime.strptime(r["ended"], "%Y-%m-%d %H:%M:%S")
        dur.append(int((e - s).total_seconds() / 60))
    except Exception:
        pass
if dur:
    print("填写时长（分钟）：min=%d 中位=%d max=%d" % (min(dur), sorted(dur)[len(dur) // 2], max(dur)))
print("=" * 72)

result = {"N": N, "segments": dict(segs), "questions": {}}

for qid, (num, title, typ) in sorted(QMETA.items(), key=lambda kv: kv[1][0]):
    print("\n【Q%d】%s  <%s>" % (num, title, typ))
    qres = {"num": num, "title": title, "type": typ}
    if typ in ("radio", "checkbox"):
        cnt = collections.Counter()
        for r in rows:
            q = r["flat"].get(qid)
            if not q:
                continue
            for o in q.get("options") or []:
                if o.get("checked"):
                    cnt[(o.get("text") or "").strip()] += 1
        for text, c in cnt.most_common():
            print("   %2d  %5.1f%%  %s" % (c, 100.0 * c / N, text))
        qres["counts"] = cnt.most_common()
    elif typ == "matrix":
        items = MATRIX_ITEMS[qid]
        vals = collections.defaultdict(list)
        for r in rows:
            q = r["flat"].get(qid)
            if not q:
                continue
            for i, g in enumerate(q.get("groups") or []):
                if i < len(items):
                    try:
                        vals[items[i]].append(float(g["text"]))
                    except Exception:
                        pass
        ranked = sorted(vals.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
        for name, v in ranked:
            print("   均值 %.2f  (n=%d)  %s" % (sum(v) / len(v), len(v), name))
        qres["means"] = [(k, round(sum(v) / len(v), 2), len(v)) for k, v in ranked]
    elif typ == "sort":
        m = SORT_ITEMS[qid]
        pos = collections.defaultdict(list)
        first = collections.Counter()
        for r in rows:
            q = r["flat"].get(qid)
            if not q:
                continue
            for o in q.get("options") or []:
                name = m.get(o["id"])
                if name and o.get("sort_no"):
                    pos[name].append(o["sort_no"])
                    if o["sort_no"] == 1:
                        first[name] += 1
        ranked = sorted(pos.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))
        for name, v in ranked:
            print("   平均位次 %.2f  第1名票数 %d  %s" % (sum(v) / len(v), first[name], name))
        qres["rank"] = [(k, round(sum(v) / len(v), 2), first[k]) for k, v in ranked]
    elif typ == "star":
        vals = []
        for r in rows:
            q = r["flat"].get(qid)
            if not q:
                continue
            v = q.get("text")
            if v is None and q.get("groups"):
                v = q["groups"][0].get("text")
            try:
                vals.append(float(v))
            except Exception:
                pass
        print("   取值：%s" % vals)
        if vals:
            print("   均值 %.1f / 10" % (sum(vals) / len(vals)))
        qres["values"] = vals
    elif typ == "textarea":
        for r in rows:
            q = r["flat"].get(qid)
            t = (q.get("text") or "").strip() if q else ""
            if t:
                print("   #%s：%s" % (r["answer_id"], t))
        qres["answers"] = [
            {"answer_id": r["answer_id"], "text": (r["flat"].get(qid) or {}).get("text", "")}
            for r in rows if (r["flat"].get(qid) or {}).get("text")
        ]
    result["questions"][qid] = qres

# 关键题的分段交叉
print("\n" + "=" * 72)
print("分段交叉（按 Q2 经验背景）")
CROSS = ["q-9-ed34", "q-16-3d92", "q-23-39c7", "q-27-e2f6", "q-42-4c18", "q-33-cbf6", "q-29-bb2a"]
cross = {}
for qid in CROSS:
    num, title, _ = QMETA[qid]
    print("\n【Q%d】%s" % (num, title))
    tab = collections.defaultdict(collections.Counter)
    for r in rows:
        q = r["flat"].get(qid)
        if not q:
            continue
        txt = ""
        for o in q.get("options") or []:
            if o.get("checked"):
                txt = (o.get("text") or "").strip()
        tab[seg_of(r["flat"])][txt] += 1
    for seg in sorted(tab):
        print("   %s => %s" % (seg, dict(tab[seg])))
    cross[qid] = {k: dict(v) for k, v in tab.items()}
result["cross"] = cross

with open(os.path.join(BASE, "统计汇总.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("\n已写出 统计汇总.json")
