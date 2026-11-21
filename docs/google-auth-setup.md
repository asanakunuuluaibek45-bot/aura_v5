# Настройка входа через Google

Кнопки Google-входа работают в веб-версии. В нативном приложении остаётся вход по email и паролю: для OAuth там отдельно нужны deep links и зарегистрированные URL-схемы.

## Настроить Supabase

1. В Google Cloud Console создайте OAuth Client ID типа **Web application**.
2. В Supabase откройте **Authentication → Sign In / Providers → Google** и включите провайдера. Укажите Client ID и Client Secret из Google Cloud Console.
3. В Google Cloud Console добавьте в **Authorized redirect URIs** callback Supabase:
   `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
4. В Supabase откройте **Authentication → URL Configuration** и добавьте в **Redirect URLs** адрес приложения с путём `/auth/callback`, например:
   `https://<APP_DOMAIN>/auth/callback`
   Для локальной разработки добавьте `http://localhost:3000/auth/callback`.
5. Примените миграцию `015_google_oauth_registration.sql` к Supabase-проекту до включения Google-входа.

Client Secret хранится только в настройках Google и Supabase. Не добавляйте его в репозиторий или клиентские переменные `NEXT_PUBLIC_*`.

После возврата из Google новые пользователи завершают регистрацию: указывают имя, магазин, телефон и запрашиваемую роль. Их профиль остаётся `pending`; Google-вход не выдаёт одобрение и не назначает роль приложения.
