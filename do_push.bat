@echo off
cd /d e:\work\龙族生文器\longzu-style
git add -A
git commit -F commit_msg.txt
git push origin main
echo PUSH_EXIT=%ERRORLEVEL%
