# Builds the single-file demo page published as the Claude artifact preview.
# Usage: python3 tools/build_artifact.py [output.html]   (default: /tmp/bloodsoup-hell.html)
import re,base64,os,sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
S=sys.argv[1] if len(sys.argv)>1 else '/tmp/bloodsoup-hell.html'
h=open('index.html').read()
h=h[h.index('<style>'):]
h='<title>Bloodsoup Hell</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'+h
old=re.search(r'    padding: calc\(env\(safe-area-inset-top\) \+ 64px\)[^\n]*\n',h).group(0)
new=('    padding-block: 64px 32px;\n    padding-left: max(16px, env(safe-area-inset-left, 0px));\n'
     '    padding-right: max(16px, env(safe-area-inset-right, 0px));\n')
h=h.replace(old,new,1)
b=base64.b64encode(open('statue.png','rb').read()).decode()
h=h.replace('src="statue.png"','src="data:image/png;base64,'+b+'"')
j=h.index('<script src="vendor/supabase.js">'); k=h.index('</body>')
rd=lambda f: open(f).read()
app=re.sub(r"\n  if \('serviceWorker' in navigator\) \{.*?\n  \}\n","\n",rd('app.js'),flags=re.S)
assert 'serviceWorker' not in app
h=h[:j]+''.join('<script>%s</script>\n'%s for s in (rd('engine.js'),rd('backend.js'),rd('rules.js'),rd('guide.js'),rd('spawndata.js'),app))+h[k:]
open(S,'w').write(h); print(len(h))
