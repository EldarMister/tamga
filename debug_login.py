import json, os, subprocess, sys, time, urllib.request, urllib.error
os.environ['POLYCONTROL_DATABASE_URL']=''
os.environ['DATABASE_URL']=''
os.environ['POLYCONTROL_DB_PATH']=os.path.join(os.getcwd(),'polycontrol.db')
print('env db',os.environ['POLYCONTROL_DB_PATH'])
p=subprocess.Popen([sys.executable,'-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8000'],cwd=os.getcwd(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
try:
  ok=False
  for _ in range(80):
    try:
      with urllib.request.urlopen('http://127.0.0.1:8000/',timeout=1) as r:
        ok=True
        break
    except Exception:
      time.sleep(0.2)
  print('started',ok)
  req=urllib.request.Request('http://127.0.0.1:8000/api/auth/login',method='POST',headers={'Content-Type':'application/json'},data=json.dumps({'username':'perfdiag','password':'perfdiag123'}).encode())
  try:
    with urllib.request.urlopen(req,timeout=5) as r:
      print('login',r.status,r.read()[:200])
  except urllib.error.HTTPError as e:
    print('login_err',e.code,e.read())
  # show few logs
  time.sleep(0.5)
  if p.stdout:
    out = p.stdout.read(1000)
    print('out',out)
finally:
  p.terminate()
  try:
    p.wait(timeout=5)
  except Exception:
    p.kill()
