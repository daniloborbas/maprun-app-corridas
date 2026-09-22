import { test, expect } from '@playwright/test';
test('discover, save, going, details, filters and persisted preferences', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Meia Maratona da Mantiqueira' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Salvar: Meia Maratona da Mantiqueira', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Eu vou: Meia Maratona da Mantiqueira', exact: true })
    .click();
  await page.getByRole('link', { name: 'Ver detalhes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Meia Maratona da Mantiqueira' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Evento de demonstração' })).toBeDisabled();
  await page.goto('/salvos');
  await expect(page.getByRole('button', { name: 'Eventos (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eu vou (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meia Maratona da Mantiqueira' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Eventos (1)' })).toBeVisible();
  await page.goto('/buscar');
  await page.getByRole('textbox', { name: 'Buscar corridas' }).fill('itajuba');
  await expect(page.getByText('2 corridas encontradas')).toBeVisible();
  await page.getByLabel('Filtrar distância').selectOption('21');
  await expect(page.getByText('1 corrida encontrada')).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar corridas' }).fill('inexistente');
  await expect(
    page.getByRole('heading', { name: 'Ainda não encontramos essa corrida' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Explorar todas as corridas' }).click();
  await expect(page.getByText('10 corridas encontradas')).toBeVisible();
  await page.getByRole('button', { name: 'Escolha sua região' }).click();
  await page.getByLabel('Cidade de referência').selectOption('Itajubá, MG');
  await expect(page.getByRole('button', { name: 'Itajubá, MG' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Itajubá, MG' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('admin and production actions fail closed; unknown events are not indexed', async ({
  page,
  request,
}) => {
  await page.goto('/admin/eventos/novo');
  await expect(page.getByRole('heading', { name: 'Área da equipe MapRun' })).toBeVisible();
  await expect(page.getByLabel('Nome da corrida')).toHaveCount(0);
  const missing = await request.get('/corrida/not-a-real-event');
  // Next.js may stream the loading boundary before notFound resolves (HTTP 200).
  // The returned UI must still be a not-found page with noindex, never an event.
  const missingHtml = await missing.text();
  expect([200, 404]).toContain(missing.status());
  expect(missingHtml).toContain('Esse percurso não foi encontrado');
  expect(missingHtml).toContain('noindex');
  expect((await request.get('/api/registration/not-valid')).status()).toBe(400);
  expect((await request.post('/api/analytics', { data: { kind: 'bad' } })).status()).toBe(403);
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
