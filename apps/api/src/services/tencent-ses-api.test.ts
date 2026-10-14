import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { sendEmailViaSesApi } from './tencent-ses-api.js';

const credential = { secretId: 'AKID-SYNTHETIC', secretKey: 'synthetic-test-key-not-a-credential', region: 'ap-guangzhou' };
describe('Tencent SES real API request format', () => {
  it('signs newline-delimited canonical headers, the signed header list, and the exact body', async () => {
    const stamp = 1700000000;
    await sendEmailViaSesApi(credential, { fromEmail:'sender@example.invalid', toEmail:'receiver@example.invalid', subject:'test', text:'123456', triggerType:1,
      template:{ id:62795, data:{ code:'123456' } } }, async (_url, init) => {
      const headers = new Headers(init!.headers), payload = String(init!.body);
      expect(headers.get('X-TC-Region')).toBe('ap-guangzhou');
      const data = JSON.parse(payload);
      expect(data.Template).toEqual({ TemplateID:62795, TemplateData:'{"code":"123456"}' });
      expect(data.Simple).toBeUndefined();
      const digest = (text:string) => createHash('sha256').update(text).digest('hex');
      const canonical = 'POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:ses.tencentcloudapi.com\nx-tc-action:sendemail\n\ncontent-type;host;x-tc-action\n' + digest(payload);
      const date = '2023-11-14', scope = date + '/ses/tc3_request';
      const hmac = (key:string|Buffer, value:string) => createHmac('sha256',key).update(value).digest();
      const key = hmac(hmac(hmac('TC3' + credential.secretKey,date),'ses'),'tc3_request');
      const signature = hmac(key,'TC3-HMAC-SHA256\n' + stamp + '\n' + scope + '\n' + digest(canonical)).toString('hex');
      expect(headers.get('Authorization')).toBe('TC3-HMAC-SHA256 Credential=' + credential.secretId + '/' + scope + ', SignedHeaders=content-type;host;x-tc-action, Signature=' + signature);
      return new Response(JSON.stringify({ Response:{ MessageId:'synthetic-message',RequestId:'synthetic-request' } }));
    }, () => stamp);
  });
  it('retains explicit legacy simple mail compatibility and reports provider rejection', async () => {
    await expect(sendEmailViaSesApi(credential,{ fromEmail:'sender@example.invalid',toEmail:'receiver@example.invalid',subject:'test',text:'123456',triggerType:1 },async(_url,init)=>{
      const body=JSON.parse(String(init!.body));
      expect(body.Template).toBeUndefined();
      expect(body.Simple.Text).toBe(Buffer.from('123456').toString('base64'));
      return new Response(JSON.stringify({Response:{Error:{Code:'FailedOperation.TemplateUnavailable',Message:'synthetic rejection'}}}));
    })).rejects.toMatchObject({code:'FailedOperation.TemplateUnavailable'});
  });
});
