"""AAT-2 browser evidence for AI-assisted StudyFlow backup-import improvement."""
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
shots=ROOT/'screenshots'
shots.mkdir(exist_ok=True)

def browser_test():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        html=(ROOT/'index.html').read_text()
        css=(ROOT/'styles.css').read_text()
        html=html.replace('<link rel="stylesheet" href="styles.css" />',f'<style>{css}</style>')
        html=html.replace('<script defer src="backup.js"></script>',f'<script>{(ROOT/"backup.js").read_text()}</script>')
        html=html.replace('<script defer src="app.js"></script>',f'<script>const backing=new Map();Object.defineProperty(window,"localStorage",{{configurable:true,value:{{getItem:k=>backing.get(k)??null,setItem:(k,v)=>backing.set(k,String(v)),removeItem:k=>backing.delete(k)}}}});</script><script>{(ROOT/"app.js").read_text()}</script>')
        errs=[]
        page.on('pageerror',lambda e:errs.append(str(e)))
        page.set_content(html,wait_until='domcontentloaded')
        assert page.locator('#statTotal').inner_text()=='6'
        assert page.locator('#importTasks').is_visible()
        page.screenshot(path=str(shots/'aat2-dashboard-import.png'),full_page=True,animations='disabled')
        before=page.locator('#statTotal').inner_text()
        invalid={'app':'StudyFlow','tasks':[{'id':'a','title':'Bad','course':'FST','due':'2026-02-30','priority':'high','done':False}]}
        page.locator('#importFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
        assert page.locator('#statTotal').inner_text()==before
        page.wait_for_timeout(250)
        assert 'impossible date' in page.locator('#toast').inner_text()
        valid={'app':'StudyFlow','exportedAt':'2026-11-15','tasks':[
            {'id':'aat2-1','title':'Prepare AAT-2 demonstration','course':'Full Stack Technologies','due':'2026-11-20','priority':'high','done':False,'notes':'AI-assisted JSON restore'},
            {'id':'aat2-2','title':'Complete prompt analysis','course':'Full Stack Technologies','due':'2026-11-19','priority':'medium','done':True,'notes':''}]}
        page.once('dialog',lambda d:d.dismiss())
        page.locator('#importFile').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(valid).encode()})
        assert page.locator('#statTotal').inner_text()=='6'
        page.once('dialog',lambda d:d.accept())
        page.locator('#importFile').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(valid).encode()})
        assert page.locator('#statTotal').inner_text()=='2'
        assert page.locator('#statDone').inner_text()=='1'
        assert page.get_by_text('Prepare AAT-2 demonstration').count()==1
        assert len(json.loads(page.evaluate("localStorage.getItem('studyflow.tasks.v1')")))==2
        page.screenshot(path=str(shots/'aat2-restored-tasks.png'),full_page=True,animations='disabled')
        assert not errs,errs
        print('PASS: import control visible; invalid backup rejected; cancellation preserves data; valid import updates 2 tasks; saved JSON validated; screenshots captured; no page errors')
        print('LIMITATION: browser used an in-memory localStorage shim due to managed browser navigation restrictions; this does NOT establish disk persistence after restart')
        browser.close()
if __name__=='__main__':browser_test()
