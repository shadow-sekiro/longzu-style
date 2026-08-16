import subprocess
import sys

proj = r"e:\work\龙族生文器\longzu-style"

p = subprocess.Popen(
    ['npm.cmd', 'run', 'dev', '--', '-p', '3500'],
    cwd=proj,
    stdout=open(proj + r'\dev3500.log', 'w', encoding='utf-8'),
    stderr=open(proj + r'\dev3500.err', 'w', encoding='utf-8'),
    stdin=subprocess.DEVNULL,
)
p.wait()
