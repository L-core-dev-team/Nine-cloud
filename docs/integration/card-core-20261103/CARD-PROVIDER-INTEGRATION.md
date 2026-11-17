# Provider 集成边界
目前没有新增真实 Provider 接线。packages/domain/src/provider-narrative.ts 的 providerAdapter 将网络传输、四种协议和原生 receipt/NPC 提示内容封装在同一函数；直接调用会带入原生叙事语义。建议另案审查最小 transport 抽取：保留既有配置、URL/响应限制、凭据和原适配器行为，以共享无业务语义的 transport 接收角色卡 messages；需先批准涉及原生连接器的具体差异。不能复制四套连接器或更改保护逻辑。真实凭据、真实请求、超时/取消及生产宿主验收均未验证。
