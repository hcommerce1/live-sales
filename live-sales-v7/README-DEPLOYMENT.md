# Live Sales - Deployment na Render.com

## 📋 Przygotowanie

### 1. Wymagania
- Konto na [Render.com](https://render.com) (darmowe)
- Konto Google Cloud Platform z Service Account dla Google Sheets API
- Token API z BaseLinker

### 2. Konfiguracja Google Service Account

1. Przejdź do [Google Cloud Console](https://console.cloud.google.com)
2. Utwórz nowy projekt lub wybierz istniejący
3. Włącz Google Sheets API:
   - Przejdź do "APIs & Services" → "Enable APIs and Services"
   - Wyszukaj "Google Sheets API" i włącz
4. Utwórz Service Account:
   - Przejdź do "APIs & Services" → "Credentials"
   - Kliknij "Create Credentials" → "Service Account"
   - Wypełnij dane i utwórz
5. Wygeneruj klucz JSON:
   - Kliknij na utworzony Service Account
   - Przejdź do zakładki "Keys"
   - Kliknij "Add Key" → "Create new key" → wybierz "JSON"
   - Pobierz plik JSON
6. Zapisz dane:
   - Email Service Account (np. `live-sales-worker@projekt.iam.gserviceaccount.com`)
   - Private Key z pliku JSON (pole `private_key`)

## 🚀 Deployment na Render

### Metoda 1: Deploy z GitHub (Zalecana)

1. **Push kodu do GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/twoja-nazwa/live-sales.git
   git push -u origin main
   ```

2. **Połącz z Render:**
   - Zaloguj się na [Render.com](https://render.com)
   - Kliknij "New +" → "Web Service"
   - Połącz swoje konto GitHub
   - Wybierz repozytorium `live-sales`

3. **Konfiguracja Web Service:**
   - **Name**: `live-sales`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free` (lub wybierz płatny plan)

4. **Dodaj zmienne środowiskowe:**

   W sekcji "Environment Variables" dodaj:

   ```
   NODE_ENV=production
   PORT=10000
   BASELINKER_API_TOKEN=twój-token-baselinker
   BASELINKER_API_URL=https://api.baselinker.com/connector.php
   GOOGLE_SERVICE_ACCOUNT_EMAIL=live-sales-worker@twoj-projekt.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\ntwój-private-key\n-----END PRIVATE KEY-----
   FRONTEND_URL=https://live-sales.onrender.com
   LOG_LEVEL=info
   ```

   **WAŻNE dla GOOGLE_PRIVATE_KEY:**
   - Skopiuj całą zawartość pola `private_key` z pliku JSON
   - Upewnij się, że zachowałeś `\n` (znaki nowej linii)
   - Przykład: `-----BEGIN PRIVATE KEY-----\nMIIEvQ...długi klucz...\n-----END PRIVATE KEY-----\n`

5. **Deploy:**
   - Kliknij "Create Web Service"
   - Render automatycznie zbuduje i uruchomi aplikację
   - Po zakończeniu otrzymasz URL (np. `https://live-sales.onrender.com`)

### Metoda 2: Deploy z Dashboard (bez GitHub)

1. **Przygotuj kod:**
   - Spakuj cały folder projektu do ZIP (bez `node_modules`)

2. **Upload do Render:**
   - Zaloguj się na Render
   - Kliknij "New +" → "Web Service"
   - Wybierz "Deploy from ZIP"
   - Wgraj plik ZIP

3. **Konfiguracja - jak w Metodzie 1 (kroki 3-5)**

## ✅ Weryfikacja

1. **Sprawdź status:**
   - Otwórz URL aplikacji: `https://twoja-aplikacja.onrender.com`
   - Sprawdź health check: `https://twoja-aplikacja.onrender.com/health`

2. **Sprawdź logi:**
   - W panelu Render → twoja aplikacja → zakładka "Logs"
   - Powinny pojawić się logi:
     ```
     🚀 Server running on port 10000
     📊 Environment: production
     ✅ Google Sheets API initialized successfully
     ⏰ Scheduler initialized
     ```

3. **Testuj aplikację:**
   - Otwórz aplikację w przeglądarce
   - Utwórz nowy eksport
   - Skonfiguruj arkusz Google Sheets
   - Uruchom testowo eksport

## 🔧 Konfiguracja Google Sheets

1. **Udostępnij arkusz:**
   - Otwórz swój arkusz Google Sheets
   - Kliknij "Udostępnij" (Share)
   - Wklej email Service Account (np. `live-sales-worker@projekt.iam.gserviceaccount.com`)
   - Wybierz uprawnienia "Edytor" (Editor)
   - Kliknij "Wyślij"

2. **Skopiuj URL:**
   - Skopiuj URL arkusza z paska adresu
   - Wklej w konfiguratorze Live Sales

## 📊 Monitoring

### Logi
- Render automatycznie zbiera logi z `console.log`, `console.error`
- Dostęp: Dashboard → Twoja aplikacja → Logs

### Metryki
- Render pokazuje podstawowe metryki (CPU, Memory, Response Time)
- Dostęp: Dashboard → Twoja aplikacja → Metrics

### Alerty
- Możesz skonfigurować alerty emailowe w ustawieniach serwisu
- Przykład: powiadomienie gdy aplikacja się restartuje

## 🔄 Aktualizacje

### Auto-Deploy z GitHub
Jeśli połączyłeś Render z GitHub:
- Każdy push do brancha `main` automatycznie triggeruje nowy deployment
- Render pobiera kod, buduje i wdraża nową wersję

### Manual Deploy
Z dashboardu Render:
- Kliknij "Manual Deploy" → "Deploy latest commit"
- Lub: wgraj nowy ZIP

## ⚙️ Zmienne środowiskowe

### Edycja zmiennych
1. Dashboard → Twoja aplikacja → Environment
2. Edytuj lub dodaj nowe zmienne
3. Kliknij "Save Changes"
4. **WAŻNE:** Aplikacja automatycznie się zrestartuje

### Przykładowe zmienne

| Zmienna | Opis | Przykład |
|---------|------|----------|
| `NODE_ENV` | Środowisko | `production` |
| `PORT` | Port aplikacji | `10000` |
| `BASELINKER_API_TOKEN` | Token API Baselinker | `5004221-5013195-...` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email Service Account | `worker@projekt.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Klucz prywatny | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----` |
| `LOG_LEVEL` | Poziom logowania | `info`, `debug`, `error` |

## 🆓 Darmowy Plan Render

### Limity Free Plan
- ✅ 750 godzin/miesiąc (wystarczy na 1 aplikację 24/7)
- ✅ Automatyczne SSL
- ✅ Darmowa subdomena `.onrender.com`
- ⚠️ Aplikacja usypia po 15 min braku ruchu
- ⚠️ Pierwsze żądanie po uśpieniu może zająć ~30s (cold start)

### Optymalizacja Free Plan
1. **Keep Alive:** Możesz użyć serwisu typu [UptimeRobot](https://uptimerobot.com) do pingowania aplikacji co 5 min
2. **Scheduled Jobs:** Twoje crony będą działać nawet gdy aplikacja śpi
3. **Upgrade:** Jeśli potrzebujesz 0 downtime, rozważ plan Starter ($7/mies)

## 🐛 Troubleshooting

### Problem: "Google Sheets API not initialized"
**Rozwiązanie:**
- Sprawdź czy `GOOGLE_PRIVATE_KEY` zawiera `\n` (znaki nowej linii)
- Upewnij się że skopiowałeś cały klucz (od `-----BEGIN` do `-----END-----`)
- Sprawdź logi pod kątem szczegółowych błędów

### Problem: "Invalid Google Sheets URL"
**Rozwiązanie:**
- URL musi być w formacie: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`
- Sprawdź czy arkusz jest udostępniony dla Service Account

### Problem: "Baselinker API Error"
**Rozwiązanie:**
- Sprawdź czy token API jest prawidłowy
- Sprawdź limity API w BaseLinker (może być przekroczony limit requestów)

### Problem: Aplikacja nie odpowiada (503)
**Rozwiązanie:**
- Sprawdź logi czy aplikacja się uruchomiła poprawnie
- Sprawdź czy nie ma błędów w buildzie
- Zrestartuj aplikację ręcznie z dashboardu

### Problem: Cold starts (wolne pierwsze żądanie)
**Rozwiązanie:**
- To normalne na Free Plan (aplikacja usypia po 15 min)
- Użyj UptimeRobot do pingowania `/health` co 5 min
- Lub upgrade do płatnego planu

## 📞 Wsparcie

### Dokumentacja
- [Render Documentation](https://render.com/docs)
- [Node.js on Render](https://render.com/docs/deploy-node-express-app)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [BaseLinker API](https://api.baselinker.com/)

### Community
- [Render Community](https://community.render.com/)

## 🎉 Gotowe!

Twoja aplikacja Live Sales działa teraz na Render! 🚀

Następne kroki:
1. ✅ Skonfiguruj swoje pierwsze eksporty
2. ✅ Udostępnij arkusze Google Sheets dla Service Account
3. ✅ Przetestuj automatyczne eksporty
4. ✅ Skonfiguruj monitoring (opcjonalnie)

Powodzenia! 🎊
