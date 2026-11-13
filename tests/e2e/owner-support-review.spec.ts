import { test, expect } from './pilot.fixture';

test('Owner review card saves edited text before sending exact version once (mocked delivery)', async ({ createSession }) => {
  const { page } = await createSession({ id: 5051, first_name: 'SupportCardTest' });
  await page.setViewportSize({ width: 390, height: 844 });
  let sends = 0;
  const ticket = { id: 42, user_id: 5151, topic: 'application', message: 'Как заменить блюдо?', status: 'open', created_at: '2026-11-13', review: { recipient_id: 5151, draft_text: 'Первый ответ', draft_version: 1, delivery_status: 'prepared', scope: 'application', sources: [], uncertainties: [] } };
  await page.route('**/api/admin/support**', async route => {
    const url = route.request().url();
    if (route.request().method() === 'GET') return route.fulfill({ json: { tickets: [ticket] } });
    const body = route.request().postDataJSON();
    expect(body.recipient_id).toBe(5151);
    expect(body.expected_version).toBe(ticket.review.draft_version);
    if (url.endsWith('/draft')) { ticket.review.draft_text = body.text; ticket.review.draft_version++; }
    if (url.endsWith('/send')) { sends++; ticket.review.delivery_status = 'approved'; }
    return route.fulfill({ json: ticket });
  });
  await page.goto('/?screen=support');
  const card = page.getByTestId('support-ticket-42');
  await expect(card).toBeVisible();
  const answer = card.getByRole('textbox');
  await expect(answer).toHaveAttribute('maxlength', '1500');
  await answer.fill('Проверенный изменённый ответ');
  await expect(card.getByRole('button', { name: 'Отправить этот ответ' })).toBeDisabled();
  await card.getByRole('button', { name: 'Сохранить изменения' }).click();
  const send = card.getByRole('button', { name: 'Отправить этот ответ' });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(card).toContainText('Одобрено, ожидает отправки');
  await expect(send).toHaveCount(0);
  expect(sends).toBe(1);
  expect(ticket.review.draft_text).toBe('Проверенный изменённый ответ');
  expect(ticket.review.draft_version).toBe(2);
});

test('Non-owner cannot see approval queue when server returns 403', async ({ createSession }) => {
  const { page } = await createSession({ id: 5052, first_name: 'NotOwner' });
  await page.route('**/api/admin/support**', route => route.fulfill({ status: 403, json: { detail: 'Forbidden' } }));
  await page.goto('/?screen=support');
  await expect(page.getByTestId('private-support')).toBeVisible();
  await expect(page.getByTestId('owner-support-queue')).toHaveCount(0);
});
