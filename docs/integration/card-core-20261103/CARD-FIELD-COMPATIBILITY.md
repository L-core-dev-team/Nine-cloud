# 字段兼容
原 parser 保存完整原始文件与解析 document；name、description、personality、scenario、mes_example、system_prompt 进入不可信角色上下文；post_history_instructions 在历史和本次行动之后作为不可信用户内容。first_mes/alternate_greetings 保留但开场选择未实现。creator_notes/tags/creator/extensions 保留原始数据、不注入；未知扩展不执行。character_book 进入选择器。不代表真实 Provider 已消费 messages，也未证明自定义格式被模型遵循。
