# ProstyGrafik — frontend

React (Create React App) client of ProstyGrafik. Project overview, architecture and setup:
[main README](../README.md).

```powershell
copy .env.example .env      # REACT_APP_API_URL=http://127.0.0.1:8000/api
npm install
npm start                   # http://localhost:3000
npm test -- --watchAll=false
npm run build
```

Structure: `src/api/` (one module per API resource), `src/components/` (pages; the manager panel's
sections live in `components/manager/`), `src/hooks/` (`useApiResource`, `useManagerData`, …),
`src/utils/` (date, time and coverage helpers).
