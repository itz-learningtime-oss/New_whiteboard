@echo off
cd /d "G:\nice_one_whiteboard"
if not exist .env (
  echo Missing .env - copying .env.example. Edit DATABASE_URL with your Postgres password, then re-run.
  copy .env.example .env
  pause
  exit /b 1
)
npx next dev -p 3010
pause