import os, subprocess, sys, time
os.environ['POLYCONTROL_DATABASE_URL']=''
os.environ['DATABASE_URL']=''
os.environ['POLYCONTROL_DB_PATH']=os.path.join(os.getcwd(),'polycontrol.db')
p=subprocess.Popen([sys.executable,'-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8010'],cwd=os.getcwd(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
time.sleep(3)
print('poll',p.poll())
if p.stdout:
  print(p.stdout.read())
if p.poll() is None:
  p.terminate(); p.wait(timeout=3)
