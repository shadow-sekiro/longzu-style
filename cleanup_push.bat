@echo off
cd /d e:\work\龙族生文器\longzu-style
git rm -f --cached build_err.log commit_msg.txt do_push.bat >nul 2>&1
del /q build_err.log commit_msg.txt do_push.bat 2>nul
echo # 本地临时文件（构建/提交辅助，勿提交）>> .gitignore
echo /build_err.log >> .gitignore
echo /commit_msg.txt >> .gitignore
echo /do_push.bat >> .gitignore
echo /tsc_err.log >> .gitignore
git add -A
git commit -F commit_msg2.txt
git push origin main
echo CLEAN_EXIT=%ERRORLEVEL%
