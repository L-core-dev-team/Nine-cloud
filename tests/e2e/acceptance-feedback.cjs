const assert = require('node:assert/strict');
const { join } = require('node:path');

// Runs with synthetic credentials and data only. Called by foundation on desktop
// and mobile; scope is the feedback defects, not a replacement for author G1.
async function checkFeedback(page) {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/settings/ai`);
  const story = page.locator('.role-panel').first();
  await story.locator('summary').first().click();
  await story.getByLabel(/^接口协议/).selectOption('openai-chat');
  await story.getByLabel(/^岗位调用/).check();
  await story.getByLabel(/^Base URL/).fill('https://api.feedback.test/v1');
  await story.getByLabel('Model ID', { exact: true }).fill('fixture-story');
  await story.locator('input[type=password]').fill('feedback-synthetic-key');
  await story.getByLabel('允许连接测试（主剧情）', { exact: true }).check();
  let probes = 0;
  await page.route('https://api.feedback.test/v1/chat/completions', async route => {
    probes++;
    assert.equal((await route.request().allHeaders()).authorization, 'Bearer feedback-synthetic-key');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'fixture reply' } }] }) });
  });
  await story.getByRole('button', { name: '测试此岗位', exact: true }).click();
  await story.locator('.role-probe [role=status]').filter({ hasText: '连接成功' }).waitFor();
  assert.equal(probes, 1);
  assert.ok(await story.locator('.role-probe [role=status]').isVisible());
  await page.getByRole('button', { name: '批量配置岗位' }).click();
  await page.getByRole('button', { name: '确认覆盖所选岗位' }).click();
  assert.equal(await page.locator('.role-panel input[type=password]').count(), 5);
  for (const input of await page.locator('.role-panel input[type=password]').all()) assert.equal(await input.inputValue(), 'feedback-synthetic-key');
  for (const panel of await page.locator('.role-panel').all()) {
    assert.equal(await panel.getByLabel('Model ID', { exact: true }).inputValue(), 'fixture-story');
    assert.equal(await panel.getByLabel(/^Base URL/).inputValue(), 'https://api.feedback.test/v1');
  }
  await page.route('https://api.feedback.test/v1/models', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'fixture-story' }, { id: 'fixture-two' }] }) }));
  await story.getByRole('button', { name: '读取可用型号' }).click();
  await story.getByLabel('选择接口型号').selectOption('fixture-two');
  assert.equal(await story.getByLabel('Model ID', { exact: true }).inputValue(), 'fixture-two');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  for (const name of ['保存配置', '调用记录', '关闭']) {
    const button = page.locator('.ai-actionbar').getByRole('button', { name, exact: true });
    assert.equal(await button.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true, `${name} must receive pointer input at the bottom`);
  }
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.locator('.ai-feedback [role=status]').filter({ hasText: '设置已保存' }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('jx10_ai_config_v2').includes('feedback-synthetic-key')), false);
  await page.getByRole('button', { name: '调用记录', exact: true }).click();
  await page.getByRole('heading', { name: '调用记录', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(new URL(page.url()).pathname, '/lobby');
  await page.goto(`${origin}/new`);
  await page.getByLabel('姓名备选', { exact: true }).selectOption('沈云舟');
  assert.equal(await page.getByRole('textbox', { name: '姓名', exact: true }).inputValue(), '沈云舟');
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('自由编写的姓名');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByLabel('天赋 / 特殊设定备选', { exact: true }).selectOption('记性过人');
  assert.equal(await page.getByRole('textbox', { name: '天赋 / 特殊设定', exact: true }).inputValue(), '记性过人');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: /^保存角色并进入/ }).click();
  await page.locator('.game-topline h1').waitFor();
  await page.getByRole('button', { name: '角色状态', exact: true }).click();
  assert.equal(await page.locator('.game-info-panel pre').count(), 0);
  assert.ok((await page.locator('.game-readable-panel').innerText()).includes('自由编写的姓名'));
  await page.getByRole('button', { name: '关闭资料面板' }).click();
  await page.getByRole('button', { name: '综合情报', exact: true }).click();
  assert.equal(await page.locator('.game-info-panel pre').count(), 0);
  assert.ok((await page.locator('.game-readable-panel').innerText()).trim().length > 0);
  await page.getByRole('button', { name: '关闭资料面板' }).click();
  await page.getByRole('button', { name: '星记忆', exact: true }).click();
  assert.ok((await page.locator('.game-readable-panel').innerText()).includes('尚无已归档记忆'));
  await page.locator('.game-tools').getByRole('button', { name: '世界设定', exact: true }).click();
  await page.getByLabel('搜索已审核世界设定', { exact: true }).fill('中州');
  await page.locator('.world-search-feedback [role=status]').filter({ hasText: /找到 \d+ 条设定/ }).waitFor();
  assert.ok(await page.locator('.worldbook-entry mark').count() > 0);
  await page.getByRole('button', { name: '查看首条结果', exact: true }).click();
  assert.equal(await page.locator('.worldbook-entry').first().evaluate(element => document.activeElement === element), true);
  await page.getByLabel('搜索已审核世界设定', { exact: true }).fill('不存在的查询词');
  await page.locator('.world-search-feedback [role=status]').filter({ hasText: '找到 0 条设定' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '查看首条结果' }).count(), 0);
  await page.screenshot({ path: join(__dirname, '../../test-results/e2e', `acceptance-feedback-${page.viewportSize().width}.png`) });
  console.log(`acceptance feedback F-01..F-05 / S-01..S-03: ${page.viewportSize().width} passed`);
}
module.exports = { checkFeedback };
