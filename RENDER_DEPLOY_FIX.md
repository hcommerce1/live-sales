# 🔧 FIX: ENOENT dist/index.html na Render

## ✅ Właśnie naprawione w commit `5d82508`

### Problem:
```
ENOENT: no such file or directory, stat '/opt/render/project/src/live-sales-v7/dist/index.html'
```

### Przyczyna:
1. ❌ Vite był w `devDependencies` zamiast `dependencies`
2. ❌ Render pomija `devDependencies` w produkcji
3. ❌ Brak Vite = brak `npm run build` = brak `dist/` = crash

### Rozwiązanie (DONE ✅):
1. ✅ Przeniesiono Vite i @vitejs/plugin-vue do `dependencies`
2. ✅ Zmieniono `vite.config.js` → `vite.config.mjs` (ES modules)
3. ✅ Commitnięto i pushnieto na GitHub

---

## 🚀 Co zrobić TERAZ na Render:

### Krok 1: Sprawdź Build Command w Render Dashboard
Idź do: **Dashboard → Your Service → Settings → Build & Deploy**

**Build Command powinien być:**
```bash
npm install && npm run build
```

**Start Command powinien być:**
```bash
npm start
```

### Krok 2: Trigger Manual Deploy
Render automatycznie wykryje nowy commit i zacznie deploy, ALE jeśli chcesz ręcznie:

1. Idź do **Manual Deploy**
2. Kliknij **Clear build cache & deploy**
3. Poczekaj 3-5 minut

### Krok 3: Sprawdź Logi Build
W Render logs powinieneś zobaczyć:

```
✅ npm install
✅ npm run build
✅ vite v6.0.11 building for production...
✅ ✓ built in 3.45s
✅ dist/index.html created
✅ Build completed
```

Jeśli widzisz to ✅ - build zadziałał!

### Krok 4: Sprawdź czy dist/ powstał
W logach powinieneś zobaczyć:
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
```

### Krok 5: Sprawdź czy Server startuje
Po build powinien wystartować Express:
```
🚀 Server running on port 10000
📊 Environment: production
```

---

## 🐛 Troubleshooting jeśli nadal nie działa:

### Problem: "Cannot find module 'vite'"
**Diagnoza:**
```bash
# W Render Shell:
npm list vite
```

**Jeśli pokazuje UNMET DEPENDENCY:**
```bash
# Fix:
npm install vite @vitejs/plugin-vue --save
```

### Problem: "vite: command not found"
**Przyczyna:** Vite nie jest zainstalowany globalnie

**Fix:** Upewnij się że używasz `npm run build` (nie `vite build`)

### Problem: Build działa ale server crash
**Sprawdź w logach:**
```
ENOENT: no such file or directory, stat 'dist/index.html'
```

**Fix:**
1. Sprawdź czy `NODE_ENV=production` jest ustawione w Render ENV vars
2. Sprawdź czy `dist/` powstał w build logs
3. Upewnij się że `server.js` ma:
```javascript
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}
```

### Problem: Pusta strona po deploy
**Diagnoza:** Sprawdź DevTools → Console

**Jeśli widzisz CSP errors:**
- To dobrze! Znaczy że app działa, tylko CSP jest strict
- Sprawdź czy masz `'self'` w scriptSrc

**Jeśli widzisz 404 na `/assets/*.js`:**
- Sprawdź czy dist/assets/ istnieje
- Może trzeba clear cache i re-deploy

---

## ✅ Checklist Deploy:

- [ ] Commit `5d82508` jest wypushowany na GitHub ✅ (DONE)
- [ ] Render wykrył nowy commit
- [ ] Build Command: `npm install && npm run build` ✅
- [ ] Start Command: `npm start` ✅
- [ ] NODE_ENV=production w Environment Variables
- [ ] Build logs pokazują "vite building for production" ✅
- [ ] dist/ folder powstał ✅
- [ ] Server wystartował na $PORT ✅
- [ ] App dostępna pod Render URL ✅
- [ ] Brak CSP errors w konsoli ✅

---

## 📊 Oczekiwany wynik:

Po deploy powinieneś zobaczyć w przeglądarce:
1. ✅ Aplikacja się ładuje
2. ✅ Brak błędów 404
3. ✅ Brak CSP errors (eval, unsafe-inline)
4. ✅ Vue app działa
5. ✅ Strict CSP w Network → Response Headers:
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdn.tailwindcss.com;
```

---

## 🎯 Następne kroki PO sukcesie:

1. **Uzupełnij template w App.vue**
   - Obecnie ma minimalny UI
   - Trzeba skopiować pełny HTML z starego index.html

2. **Uruchom Prisma migrations**
```bash
# W Render Shell:
npx prisma migrate deploy
```

3. **Dodaj Google Service Account JSON**
   - W Render ENV variables
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = full JSON content

4. **Test wszystkich funkcji**
   - Login
   - Export creation
   - Google Sheets write
   - BaseLinker sync

---

## 🆘 Jeśli NADAL nie działa po 5d82508:

**Wyślij mi:**
1. Screenshot Render build logs (cały output)
2. Screenshot Render runtime logs (ostatnie 50 linii)
3. Screenshot DevTools → Console (błędy)
4. Screenshot Render → Environment Variables (zamazuj secrets)

**I naprawię w następnym commit! 💪**
