@echo off
cd /d e:\work\龙族生文器\longzu-style
git rm -f --cached tsc_check.log >nul 2>&1
del /q tsc_check.log 2>nul
echo /tsc_check.log >> .gitignore
git add -A
git commit -m "fix: lazy-load corpus to avoid Vercel build ENOENT on missing corpus.bin"
git push origin main
echo PUSH_EXIT=%ERRORLEVEL%
