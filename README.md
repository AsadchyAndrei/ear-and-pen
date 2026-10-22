# Ear & Pen

Тренажёр английского для русскоговорящих.

- **Диктант.** Диалоги озвучиваются двумя голосами. Вы пишете услышанное, страница проверяет по словам и подсвечивает ошибки. Claude объясняет, почему слово легко ослышать.
- **Перевод RU → EN.** Даётся русское предложение, вы пишете перевод. Claude ставит оценку, показывает исправленный и «носительский» вариант, альтернативы и разбирает каждую ошибку с правилом.
- **Прогресс.** Статистика и список ваших ошибок хранятся в браузере.

Сайт: https://asadchyandrei.github.io/ear-and-pen/

## Как устроено

| Файл | Что делает |
|---|---|
| `index.html`, `styles.css` | Страница и оформление |
| `js/app.js` | Всё приложение: диктант, перевод, прогресс, озвучка, телефонная панель, установка, синхронизация |
| `js/cloud.js` | Вход и сохранение в облаке (Firebase Auth + Firestore), как в Pip's Sky Islands |
| `js/merge.js` | Объединение данных устройства и облака (чистые функции) |
| `prompts.js` | Тексты запросов к Claude — общие для сайта и сервера |
| `config.js` | Адрес сервера (`API_URL`) и настройки Firebase (`FIREBASE`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: установка на телефон и работа без интернета |
| `firestore.rules` | Правила доступа: каждый аккаунт видит только свои данные |
| `worker/index.js`, `wrangler.toml` | Сервер на Cloudflare Workers: Claude (4 задачи) и HD-озвучка |

Сайт: https://earandpen.net (GitHub Pages, файл `CNAME`). Сервер: https://api.earandpen.net.

Озвучка — HD-голоса Google Chirp 3 HD через сервер: каждая фраза синтезируется один раз и хранится в Cloudflare KV и на устройстве. Аудио встроенных диалогов сохраняется заранее, поэтому диктант работает без интернета. Если сервер недоступен, звучат голоса браузера.

При выпуске новой версии увеличьте `V` в `sw.js` — у пользователей появится кнопка «Обновить».

## Сервер Claude (Cloudflare Workers)

1. Cloudflare → Workers & Pages → Create → Import a repository → этот репозиторий. Настройки сборки по умолчанию: Wrangler сам возьмёт `wrangler.toml`.
2. В настройках воркера → Variables and Secrets → добавить **Secret** `ANTHROPIC_API_KEY` (ключ с console.anthropic.com).
3. Для HD-голосов: в Google Cloud → APIs & Services → Credentials создать API key с ограничением **Cloud Text-to-Speech API** и добавить его в воркер как **Secret** `GOOGLE_TTS_KEY`. Хранилище `AUDIO` (KV) Wrangler создаёт сам при первом деплое.
4. Адрес сервера (`https://api.earandpen.net`) указан в `config.js`.

Каждый push в `main` пересобирает и сайт, и сервер.

Рекомендуется поставить месячный лимит расходов в console.anthropic.com → Settings → Limits.
