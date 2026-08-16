@echo off
cd /d e:\work\龙族生文器\longzu-style
git rm -f --cached cleanup_push.bat commit_msg2.txt >nul 2>&1
del /q cleanup_push.bat commit_msg2.txt 2>nul
echo /cleanup_push.bat >> .gitignore
echo /commit_msg2.txt >> .gitignore
git add -A
git commit -m "chore: remove final temp helper files"
git push origin main
echo FINAL_EXIT=%ERRORLEVEL%
